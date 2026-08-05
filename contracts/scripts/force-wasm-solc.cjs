// Two things, both only relevant in network-restricted sandboxes that can't
// reach binaries.soliditylang.org — a normal environment (e.g. a Codespace
// with full internet access) doesn't need this file at all; `npx hardhat
// compile` just works there.
//
// 1. Forces Hardhat's CompilerDownloader.getCompilerPlatform() to resolve to
//    the WASM platform instead of native linux-amd64, by making the one call
//    site it checks (os.platform()) report an unrecognized platform.
//
// 2. WASM still needs binaries.soliditylang.org/wasm/list.json + the actual
//    compiler file, which is equally blocked — so this also pre-seeds
//    Hardhat's compiler cache (~/.cache/hardhat-nodejs/compilers-v2/wasm)
//    directly from the `solc` npm package already sitting in node_modules
//    (reachable via the npm registry, unlike binaries.soliditylang.org),
//    skipping the download entirely. The list.json entry's checksums are
//    self-referential (computed from the very file placed alongside it),
//    which is fine because Hardhat only verifies them during an actual
//    download — once the file already exists at the expected path, that
//    verification step never runs.
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const realPlatform = os.platform;
os.platform = () => "arcrelay-sandbox";

const SOLC_VERSION = "0.8.24";

function seedWasmCompilerCache() {
  const home = process.env.HOME ?? require("os").homedir();
  const wasmDir = path.join(home, ".cache", "hardhat-nodejs", "compilers-v2", "wasm");
  const compilerFilename = `soljson-v${SOLC_VERSION}.js`;
  const compilerPath = path.join(wasmDir, compilerFilename);
  const listPath = path.join(wasmDir, "list.json");

  if (fs.existsSync(compilerPath) && fs.existsSync(listPath)) {
    return; // already seeded (e.g. by a previous run)
  }

  const solcJsSource = require.resolve("solc/soljson.js", { paths: [process.cwd()] });

  fs.mkdirSync(wasmDir, { recursive: true });
  fs.copyFileSync(solcJsSource, compilerPath);

  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(compilerPath)).digest("hex");

  fs.writeFileSync(
    listPath,
    JSON.stringify(
      {
        builds: [
          {
            path: compilerFilename,
            version: SOLC_VERSION,
            build: "commit.local",
            longVersion: `${SOLC_VERSION}+commit.local`,
            keccak256: `0x${sha256}`, // not a real keccak256, but unused: see note above
            sha256: `0x${sha256}`,
            urls: [],
          },
        ],
        releases: { [SOLC_VERSION]: compilerFilename },
        latestRelease: SOLC_VERSION,
      },
      null,
      2
    )
  );
}

try {
  seedWasmCompilerCache();
} catch (err) {
  console.warn(
    `force-wasm-solc.cjs: couldn't pre-seed the WASM compiler cache (${err.message}). ` +
      "Falling back to Hardhat's normal download behavior."
  );
}

module.exports = { realPlatform };
