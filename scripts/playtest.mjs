import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");
const distRoot = resolve(repoRoot, "dist");
const basePath = "/paper-jam-dodgeball/";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function parseArgs(argv) {
  const options = {
    runs: 4,
    duration: 30,
    sampleInterval: 1,
    viewportWidth: 1440,
    viewportHeight: 900,
    seedPrefix: "baseline",
    screenshots: [0, 10, 20, 30],
    outDir: "",
    chromePath: process.env.CHROME_PATH || "",
    skipBuild: false,
    minChaos: 80,
    maxChaosTime: 30,
    minBrokenProps: 8,
    minFragments: 60,
    minPlayerLaunches: 4,
    maxFragments: 900,
    maxParticles: 1800,
    maxScoreSpread: 45,
  };

  for (const arg of argv) {
    const [name, rawValue] = arg.split("=");
    const value = rawValue ?? "true";
    switch (name) {
      case "--runs":
        options.runs = Number(value);
        break;
      case "--duration":
        options.duration = Number(value);
        break;
      case "--sample-interval":
        options.sampleInterval = Number(value);
        break;
      case "--viewport":
        [options.viewportWidth, options.viewportHeight] = value.split("x").map(Number);
        break;
      case "--seed-prefix":
        options.seedPrefix = value;
        break;
      case "--screenshots":
        options.screenshots = value.split(",").map(Number).filter((n) => Number.isFinite(n));
        break;
      case "--out":
        options.outDir = value;
        break;
      case "--chrome":
        options.chromePath = value;
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      case "--min-chaos":
        options.minChaos = Number(value);
        break;
      case "--max-chaos-time":
        options.maxChaosTime = Number(value);
        break;
      case "--min-broken-props":
        options.minBrokenProps = Number(value);
        break;
      case "--min-fragments":
        options.minFragments = Number(value);
        break;
      case "--min-player-launches":
        options.minPlayerLaunches = Number(value);
        break;
      case "--max-fragments":
        options.maxFragments = Number(value);
        break;
      case "--max-particles":
        options.maxParticles = Number(value);
        break;
      case "--max-score-spread":
        options.maxScoreSpread = Number(value);
        break;
      default:
        if (arg !== "--help") throw new Error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(0);
    }
  }

  if (!Number.isFinite(options.runs) || options.runs < 1) throw new Error("--runs must be >= 1");
  if (!Number.isFinite(options.duration) || options.duration < 5) throw new Error("--duration must be >= 5");
  if (!Number.isFinite(options.sampleInterval) || options.sampleInterval <= 0) {
    throw new Error("--sample-interval must be > 0");
  }
  return options;
}

function printHelp() {
  console.log(`Usage: npm run playtest -- [options]

Options:
  --runs=4                  Number of seeded runs.
  --duration=30             Seconds per run.
  --sample-interval=1       Seconds between metric samples.
  --screenshots=0,10,20,30  Screenshot timestamps in seconds.
  --seed-prefix=baseline    Seed prefix used as <prefix>-01, <prefix>-02...
  --out=playtests/name      Output directory.
  --chrome=PATH             Chrome executable path. CHROME_PATH also works.
  --skip-build              Reuse the existing dist/ build.
  --min-player-launches=N   Minimum launched players per run.
`);
}

function timestampForPath(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function runBuild() {
  const viteCli = resolve(repoRoot, "node_modules", "vite", "bin", "vite.js");
  const result = spawnSync(process.execPath, [viteCli, "build", "--base=/paper-jam-dodgeball/"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Build failed with exit code ${result.status ?? "unknown"}${result.error ? `: ${result.error.message}` : ""}`);
  }
}

function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome was not found. Pass --chrome=PATH or set CHROME_PATH.");
  return found;
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        response.writeHead(302, { Location: basePath });
        response.end();
        return;
      }
      if (!pathname.startsWith(basePath)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const stripped = pathname.slice(basePath.length) || "index.html";
      const normalized = normalize(stripped).replace(/^(\.\.[/\\])+/, "");
      let target = resolve(join(distRoot, normalized));
      if (!target.startsWith(distRoot)) target = join(distRoot, "index.html");

      let body;
      try {
        body = await readFile(target);
      } catch {
        target = join(distRoot, "index.html");
        body = await readFile(target);
      }

      response.writeHead(200, {
        "Content-Type": mimeTypes[extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(String(error?.stack || error));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  return {
    server,
    port: server.address().port,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

async function waitForMetrics(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const metrics = await evaluateMetrics(page);
    if (metrics) return metrics;
    await delay(200);
  }
  throw new Error("Timed out waiting for __voxelOfficeDodgeball.metrics()");
}

async function evaluateMetrics(page) {
  return page.evaluate(() => window.__voxelOfficeDodgeball?.metrics?.() ?? null);
}

function evaluateRun(run, options) {
  const final = run.finalMetrics;
  const gates = [];
  const add = (name, pass, detail) => gates.push({ name, pass, detail });

  add("no_page_errors", run.pageErrors.length === 0, `${run.pageErrors.length} page errors`);
  add("no_console_warnings", run.consoleWarnings.length === 0, `${run.consoleWarnings.length} console warnings/errors`);
  add("metrics_available", Boolean(final), final ? "metrics captured" : "missing final metrics");

  if (final) {
    add("texture_loaded", final.textureAtlasLoaded === true, `textureAtlasLoaded=${final.textureAtlasLoaded}`);
    add("chaos_reaches_threshold", final.peakChaos >= options.minChaos, `peakChaos=${final.peakChaos}, min=${options.minChaos}`);
    add(
      "chaos_ramps_fast_enough",
      final.timeToChaos80 !== null && final.timeToChaos80 <= options.maxChaosTime,
      `timeToChaos80=${final.timeToChaos80}, max=${options.maxChaosTime}`,
    );
    add(
      "enough_breakage",
      final.brokenPropCount >= options.minBrokenProps,
      `brokenPropCount=${final.brokenPropCount}, min=${options.minBrokenProps}`,
    );
    add(
      "enough_fragments",
      final.dynamicFragmentCount >= options.minFragments,
      `dynamicFragmentCount=${final.dynamicFragmentCount}, min=${options.minFragments}`,
    );
    add(
      "players_launch",
      (final.events?.playerLaunches ?? 0) >= options.minPlayerLaunches,
      `playerLaunches=${final.events?.playerLaunches ?? 0}, min=${options.minPlayerLaunches}`,
    );
    add(
      "fragments_bounded",
      final.dynamicFragmentCount <= options.maxFragments,
      `dynamicFragmentCount=${final.dynamicFragmentCount}, max=${options.maxFragments}`,
    );
    add(
      "particles_bounded",
      final.particleCount <= options.maxParticles,
      `particleCount=${final.particleCount}, max=${options.maxParticles}`,
    );
    add(
      "score_spread_bounded",
      final.scoreSpread <= options.maxScoreSpread,
      `scoreSpread=${final.scoreSpread}, max=${options.maxScoreSpread}`,
    );
  }

  return {
    pass: gates.every((gate) => gate.pass),
    gates,
  };
}

function summarizeRuns(runs, options) {
  const finals = runs.map((run) => run.finalMetrics).filter(Boolean);
  const average = (selector) =>
    finals.length === 0 ? null : Number((finals.reduce((sum, item) => sum + selector(item), 0) / finals.length).toFixed(2));

  return {
    pass: runs.every((run) => run.evaluation.pass),
    runCount: runs.length,
    passedRuns: runs.filter((run) => run.evaluation.pass).length,
    averages: {
      peakChaos: average((m) => m.peakChaos),
      timeToChaos80: average((m) => m.timeToChaos80 ?? options.duration),
      brokenPropCount: average((m) => m.brokenPropCount),
      brokenBarrierCount: average((m) => m.brokenBarrierCount),
      dynamicFragmentCount: average((m) => m.dynamicFragmentCount),
      playerLaunches: average((m) => m.events?.playerLaunches ?? 0),
      activePropCount: average((m) => m.activePropCount),
      particleCount: average((m) => m.particleCount),
      scoreSpread: average((m) => m.scoreSpread),
    },
  };
}

function markdownReport({ options, summary, runs, outputDir }) {
  const rel = (path) => relative(outputDir, path).replace(/\\/g, "/");
  const lines = [
    "# Paper Jam Dodgeball Playtest",
    "",
    `- Result: ${summary.pass ? "PASS" : "FAIL"}`,
    `- Runs: ${summary.passedRuns}/${summary.runCount}`,
    `- Duration: ${options.duration}s per run`,
    `- Seed prefix: ${options.seedPrefix}`,
    "",
    "## Aggregate",
    "",
    "| Metric | Average |",
    "| --- | ---: |",
    `| peakChaos | ${summary.averages.peakChaos ?? "n/a"} |`,
    `| timeToChaos80 | ${summary.averages.timeToChaos80 ?? "n/a"} |`,
    `| brokenPropCount | ${summary.averages.brokenPropCount ?? "n/a"} |`,
    `| brokenBarrierCount | ${summary.averages.brokenBarrierCount ?? "n/a"} |`,
    `| dynamicFragmentCount | ${summary.averages.dynamicFragmentCount ?? "n/a"} |`,
    `| playerLaunches | ${summary.averages.playerLaunches ?? "n/a"} |`,
    `| activePropCount | ${summary.averages.activePropCount ?? "n/a"} |`,
    `| particleCount | ${summary.averages.particleCount ?? "n/a"} |`,
    `| scoreSpread | ${summary.averages.scoreSpread ?? "n/a"} |`,
    "",
    "## Runs",
    "",
  ];

  for (const run of runs) {
    const final = run.finalMetrics;
    lines.push(`### ${run.id} (${run.seed})`);
    lines.push("");
    lines.push(`- Result: ${run.evaluation.pass ? "PASS" : "FAIL"}`);
    if (final) {
      lines.push(`- Peak chaos: ${final.peakChaos}`);
      lines.push(`- Time to chaos 80: ${final.timeToChaos80 ?? "never"}`);
      lines.push(`- Broken props/barriers: ${final.brokenPropCount}/${final.brokenBarrierCount}`);
      lines.push(`- Dynamic fragments: ${final.dynamicFragmentCount}`);
      lines.push(`- Player launches: ${final.events?.playerLaunches ?? 0}`);
      lines.push(`- Active props: ${final.activePropCount}`);
      lines.push(`- Particles: ${final.particleCount}`);
      lines.push(`- Score: Blue ${final.blueScore} / Red ${final.redScore}`);
    }
    lines.push(`- Samples: ${rel(run.metricsPath)}`);
    lines.push(`- Screenshots: ${run.screenshots.map((screenshot) => rel(screenshot.path)).join(", ")}`);
    lines.push("");
    lines.push("| Gate | Result | Detail |");
    lines.push("| --- | --- | --- |");
    for (const gate of run.evaluation.gates) {
      lines.push(`| ${gate.name} | ${gate.pass ? "PASS" : "FAIL"} | ${gate.detail.replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function runOnePlaytest({ runIndex, browser, serverBaseUrl, outputDir, options }) {
  const runNumber = String(runIndex + 1).padStart(2, "0");
  const id = `run-${runNumber}`;
  const seed = `${options.seedPrefix}-${runNumber}`;
  const runDir = join(outputDir, "runs", id);
  const screenshotDir = join(outputDir, "screenshots", id);
  await mkdir(runDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  const url = `${serverBaseUrl}?seed=${encodeURIComponent(seed)}&playtest=1`;
  const page = await browser.newPage({
    viewport: {
      width: options.viewportWidth,
      height: options.viewportHeight,
    },
  });
  const pageErrors = [];
  const consoleWarnings = [];
  const screenshots = [];
  const samples = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleWarnings.push(`${message.type()}: ${message.text()}`);
    }
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await waitForMetrics(page);

  const screenshotTimes = [...new Set(options.screenshots.filter((time) => time <= options.duration))].sort((a, b) => a - b);
  let nextScreenshotIndex = 0;
  const startedAt = Date.now();
  const sampleCount = Math.ceil(options.duration / options.sampleInterval);

  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
    const targetMs = startedAt + sampleIndex * options.sampleInterval * 1000;
    await delay(Math.max(0, targetMs - Date.now()));
    const elapsed = Number(((Date.now() - startedAt) / 1000).toFixed(2));
    const metrics = await evaluateMetrics(page);
    samples.push({ elapsed, metrics });

    while (nextScreenshotIndex < screenshotTimes.length && elapsed >= screenshotTimes[nextScreenshotIndex] - 0.05) {
      const stamp = String(Math.round(screenshotTimes[nextScreenshotIndex])).padStart(3, "0");
      const path = join(screenshotDir, `${id}-t${stamp}.png`);
      await page.screenshot({ path });
      screenshots.push({ time: screenshotTimes[nextScreenshotIndex], path });
      nextScreenshotIndex += 1;
    }
  }

  const finalMetrics = samples.at(-1)?.metrics ?? null;
  const metricsPath = join(runDir, "metrics.json");
  const runRecord = {
    id,
    seed,
    url,
    samples,
    finalMetrics,
    pageErrors,
    consoleWarnings,
    screenshots,
    metricsPath,
  };
  runRecord.evaluation = evaluateRun(runRecord, options);
  await writeFile(metricsPath, JSON.stringify(runRecord, null, 2), "utf8");
  await page.close();
  return runRecord;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = resolve(repoRoot, options.outDir || join("playtests", timestampForPath()));
  const chromePath = findChrome(options.chromePath);

  if (!options.skipBuild) runBuild();
  await mkdir(outputDir, { recursive: true });

  const server = await startStaticServer();
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromePath,
      args: ["--disable-search-engine-choice-screen"],
    });
    const serverBaseUrl = `http://127.0.0.1:${server.port}${basePath}`;
    const runs = [];
    for (let i = 0; i < options.runs; i += 1) {
      console.log(`Running playtest ${i + 1}/${options.runs}...`);
      runs.push(await runOnePlaytest({ runIndex: i, browser, serverBaseUrl, outputDir, options }));
    }

    const summary = summarizeRuns(runs, options);
    const result = {
      createdAt: new Date().toISOString(),
      outputDir,
      options,
      chromePath,
      summary,
      runs: runs.map((run) => ({
        id: run.id,
        seed: run.seed,
        finalMetrics: run.finalMetrics,
        pageErrors: run.pageErrors,
        consoleWarnings: run.consoleWarnings,
        screenshots: run.screenshots,
        evaluation: run.evaluation,
      })),
    };

    await writeFile(join(outputDir, "metrics.json"), JSON.stringify(result, null, 2), "utf8");
    await writeFile(join(outputDir, "summary.md"), markdownReport({ options, summary, runs, outputDir }), "utf8");

    console.log(`\n${summary.pass ? "PASS" : "FAIL"} ${summary.passedRuns}/${summary.runCount} runs`);
    console.log(`Report: ${join(outputDir, "summary.md")}`);
    process.exitCode = summary.pass ? 0 : 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
