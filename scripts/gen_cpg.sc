/**
 * gen_cpg.sc
 *
 * Joern 脚本：分析指定源文件，生成 CPG 并导出为 JSON 格式
 *
 * 使用方式：
 *   joern --script /workspace/scripts/gen_cpg.sc \
 *         --params inputPath=/workspace/src/target.c,outputPath=/tmp/cpg_output.json
 *
 * 输出格式：符合 SeCodeAct CpgGraphData 接口的 JSON 结构
 */

@main def exec(inputPath: String, outputPath: String = "/tmp/cpg_output.json") = {
  import io.joern.c2cpg.C2Cpg
  import io.joern.x2cpg.X2Cpg
  import io.shiftleft.semanticcpg.language._
  import io.joern.dataflowengineoss.language._
  import ujson._

  println(s"[SCA-006] Joern CPG 生成开始")
  println(s"[SCA-006] 输入路径: $inputPath")
  println(s"[SCA-006] 输出路径: $outputPath")

  // 导入源文件并生成 CPG
  importCode(inputPath)

  println(s"[SCA-006] CPG 生成完成，开始提取节点和边...")

  // 提取方法节点
  val methodNodes = cpg.method.l.take(50).map { m =>
    val nodeId = s"method_${m.id}"
    ujson.Obj(
      "id"       -> nodeId,
      "type"     -> "cfg",
      "label"    -> m.name,
      "subLabel" -> "Method",
      "file"     -> m.filename,
      "line"     -> m.lineNumber.getOrElse(-1),
      "code"     -> m.code.take(100)
    )
  }

  // 提取参数节点（作为 AST 节点）
  val paramNodes = cpg.parameter.l.take(30).map { p =>
    ujson.Obj(
      "id"       -> s"param_${p.id}",
      "type"     -> "ast",
      "label"    -> p.name,
      "subLabel" -> s"Param: ${p.typeFullName}",
      "file"     -> p.method.filename,
      "line"     -> p.lineNumber.getOrElse(-1),
      "code"     -> p.code.take(100)
    )
  }

  // 提取调用节点
  val callNodes = cpg.call.l.take(30).map { c =>
    ujson.Obj(
      "id"       -> s"call_${c.id}",
      "type"     -> "call",
      "label"    -> c.name,
      "subLabel" -> "CallExpr",
      "file"     -> c.method.filename,
      "line"     -> c.lineNumber.getOrElse(-1),
      "code"     -> c.code.take(100)
    )
  }

  // 提取数据流 Source（外部输入参数）
  val sourceNodes = cpg.parameter.filter(_.name.matches(".*input.*|.*src.*|.*data.*|.*buf.*")).l.take(10).map { p =>
    ujson.Obj(
      "id"       -> s"source_${p.id}",
      "type"     -> "source",
      "label"    -> p.name,
      "subLabel" -> "UserInput",
      "file"     -> p.method.filename,
      "line"     -> p.lineNumber.getOrElse(-1),
      "code"     -> p.code.take(100)
    )
  }

  // 提取危险 Sink（危险函数调用）
  val dangerousFuncs = Set("strcpy", "strcat", "sprintf", "gets", "scanf", "system", "exec", "popen")
  val sinkNodes = cpg.call.filter(c => dangerousFuncs.contains(c.name)).l.take(10).map { c =>
    ujson.Obj(
      "id"       -> s"sink_${c.id}",
      "type"     -> "sink",
      "label"    -> s"${c.name}()",
      "subLabel" -> "DangerousSink",
      "file"     -> c.method.filename,
      "line"     -> c.lineNumber.getOrElse(-1),
      "code"     -> c.code.take(100)
    )
  }

  // 合并所有节点
  val allNodes = sourceNodes ++ methodNodes ++ paramNodes ++ callNodes ++ sinkNodes

  // 生成边（方法 -> 参数，方法 -> 调用）
  val edges = cpg.method.l.take(20).flatMap { m =>
    val methodId = s"method_${m.id}"
    val paramEdges = m.parameter.l.take(5).map { p =>
      ujson.Obj(
        "id"     -> s"edge_mp_${m.id}_${p.id}",
        "source" -> methodId,
        "target" -> s"param_${p.id}",
        "type"   -> "controlflow",
        "label"  -> "hasParam"
      )
    }
    val callEdges = m.call.l.take(5).map { c =>
      ujson.Obj(
        "id"     -> s"edge_mc_${m.id}_${c.id}",
        "source" -> methodId,
        "target" -> s"call_${c.id}",
        "type"   -> "dataflow",
        "label"  -> "calls"
      )
    }
    paramEdges ++ callEdges
  }

  // 添加 Source -> Sink 污点边
  val taintEdges = if (sourceNodes.nonEmpty && sinkNodes.nonEmpty) {
    Seq(ujson.Obj(
      "id"     -> "taint_edge_0",
      "source" -> sourceNodes.head("id").str,
      "target" -> sinkNodes.head("id").str,
      "type"   -> "taintprop",
      "label"  -> "taintFlow"
    ))
  } else Seq.empty

  val allEdges = edges ++ taintEdges

  // 构建输出 JSON
  val output = ujson.Obj(
    "cveId"       -> "REAL-CPG",
    "file"        -> inputPath,
    "generatedAt" -> java.time.Instant.now().toString,
    "nodes"       -> ujson.Arr(allNodes: _*),
    "edges"       -> ujson.Arr(allEdges: _*)
  )

  // 写入输出文件
  os.write.over(os.Path(outputPath), ujson.write(output, indent = 2))

  println(s"[SCA-006] CPG JSON 已写入: $outputPath")
  println(s"[SCA-006] 节点数: ${allNodes.length}, 边数: ${allEdges.length}")
  println("[SCA-006] 完成！")
}
