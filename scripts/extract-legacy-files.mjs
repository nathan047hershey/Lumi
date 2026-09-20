import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve("c:/Vincent/Projects/02.Lumi");
const ZIP = path.join(ROOT, "Lumi-Auto-Bid-System.zip");
const DEST = path.join(ROOT, "lumi", "data");

fs.mkdirSync(DEST, { recursive: true });

const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead(${JSON.stringify(ZIP)})
$copied = 0
try {
  foreach ($entry in $zip.Entries) {
    $n = $entry.FullName.Replace('\\','/')
    $kind = $null
    if ($n -like 'Lumi-Auto-Bid-System/database/resumes/*' -and $entry.Length -gt 0) { $kind = 'resumes' }
    elseif ($n -like 'Lumi-Auto-Bid-System/database/bidder/*' -and $entry.Length -gt 0) { $kind = 'bidder' }
    if (-not $kind) { continue }
    $rel = $n.Substring($n.IndexOf($kind + '/'))
    $out = Join-Path ${JSON.stringify(DEST)} ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    $dir = Split-Path $out -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $out, $true)
    $copied++
  }
  Write-Output "copied=$copied"
} finally { $zip.Dispose() }
`;

const result = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
console.log(result.trim());
