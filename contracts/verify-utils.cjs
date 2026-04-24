/**
 * Hardhat verify com retry (BscScan às vezes ainda não indexou o contrato).
 * Requer ETHERSCAN_API_KEY (V2) ou BSCSCAN_API_KEY no .env. Desative com SKIP_VERIFY=1.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hasVerifyApiKey() {
  return Boolean(process.env.ETHERSCAN_API_KEY?.trim() || process.env.BSCSCAN_API_KEY?.trim());
}

function shouldSkipVerify() {
  return process.env.SKIP_VERIFY === "1" || !hasVerifyApiKey();
}

/**
 * @param {import("hardhat").HardhatRuntimeEnvironment} hre
 * @param {string} address
 * @param {string} label
 * @param {unknown[]} [constructorArguments]
 * @param {{ retries?: number, delayMs?: number }} [opts]
 */
async function verifyWithRetry(hre, address, label, constructorArguments, opts = {}) {
  const retries = opts.retries ?? 6;
  const delayMs = opts.delayMs ?? 12000;
  let lastErr = "";

  for (let i = 0; i < retries; i++) {
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: constructorArguments ?? [],
      });
      console.log(`   OK verified: ${label} ${address}`);
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      lastErr = msg;
      if (/already verified|Already Verified|similar match/i.test(msg)) {
        console.log(`   OK already verified: ${label} ${address}`);
        return true;
      }
      if (i < retries - 1) {
        console.log(
          `   Verify ${label}: attempt ${i + 1}/${retries} failed (${msg.slice(0, 120)}...), waiting ${delayMs / 1000}s...`
        );
        await sleep(delayMs);
      }
    }
  }
  console.error(`   FAILED verify: ${label} ${address}`);
  console.error(`   Last error: ${lastErr}`);
  return false;
}

/**
 * @param {import("hardhat").HardhatRuntimeEnvironment} hre
 * @param {Array<{ address: string, label: string, constructorArguments?: unknown[] }>} contracts
 */
async function verifyDeployedContracts(hre, contracts) {
  if (process.env.SKIP_VERIFY === "1") {
    console.log("\n   (Verification skipped: SKIP_VERIFY=1)\n");
    return;
  }
  if (!hasVerifyApiKey()) {
    console.log("\n   (Verification skipped: add ETHERSCAN_API_KEY or BSCSCAN_API_KEY to .env)\n");
    return;
  }

  console.log("\n=== Verifying on block explorer ===\n");
  for (const c of contracts) {
    await verifyWithRetry(hre, c.address, c.label, c.constructorArguments);
  }
  console.log("");
}

module.exports = { verifyDeployedContracts, verifyWithRetry, shouldSkipVerify, hasVerifyApiKey };
