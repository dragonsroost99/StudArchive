#!/usr/bin/env node

// Simple Rebrickable health check script
// Usage:
//   REBRICKABLE_API_KEY=your_key_here node rebrickable-healthcheck.mjs

const API_KEY = process.env.REBRICKABLE_API_KEY;

if (!API_KEY) {
  console.warn("⚠️  REBRICKABLE_API_KEY env var is not set. Key checks will be skipped.");
}

async function fetchWithReport(label, url, options = {}) {
  console.log(`\n=== ${label} ===`);
  console.log(`→ GET ${url}`);

  try {
    const res = await fetch(url, options);
    const status = res.status;
    const contentType = res.headers.get("content-type") || "";
    const textSnippet = (await res.text()).slice(0, 300);

    console.log(`← Status: ${status}`);
    console.log(`   Content-Type: ${contentType}`);

    // Try to classify the response
    if (textSnippet.startsWith("<!doctype html") || textSnippet.includes("Access denied")) {
      console.log("   ⚠️  HTML / Cloudflare page detected.");
      if (textSnippet.includes("Error 1006") || textSnippet.includes("has banned your IP address")) {
        console.log("   ❌ Cloudflare Error 1006 / IP banned by site firewall.");
      } else {
        console.log("   ⚠️  Some HTML error page from Cloudflare or the site.");
      }
    } else if (contentType.includes("application/json")) {
      try {
        const json = JSON.parse(textSnippet || "{}");
        console.log("   JSON snippet:", JSON.stringify(json, null, 2).slice(0, 260));
      } catch {
        console.log("   JSON body (partial):", textSnippet);
      }
    } else {
      console.log("   Body (partial):", JSON.stringify(textSnippet));
    }

    return { status, contentType, bodySnippet: textSnippet };
  } catch (err) {
    console.log("   ❌ Network or DNS error:", err.message);
    return { error: err };
  }
}

async function main() {
  console.log("🔎 Rebrickable Health Check");
  console.log("---------------------------");

  // 1) Check base site reachability (HTML)
  const baseUrl = "https://rebrickable.com/";
  const base = await fetchWithReport("1) Base site reachability", baseUrl);

  // 2) Check API without auth header (should usually 401/403 JSON, not HTML ban)
  const colorsUrl = "https://rebrickable.com/api/v3/lego/colors/";
  const noAuth = await fetchWithReport("2) API /colors without API key", colorsUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  // 3) Check API with provided key (if present)
  if (API_KEY) {
    const withAuth = await fetchWithReport("3) API /colors with API key", colorsUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `key ${API_KEY}`,
      },
    });

    console.log("\n=== Summary ===");

    if (base.error || noAuth.error || withAuth.error) {
      console.log("❌ There were network-level errors (DNS / TLS / connectivity).");
    }

    const looksBannedHtml =
      (base.bodySnippet && base.bodySnippet.includes("has banned your IP address")) ||
      (noAuth.bodySnippet && noAuth.bodySnippet.includes("has banned your IP address")) ||
      (withAuth.bodySnippet && withAuth.bodySnippet.includes("has banned your IP address"));

    if (looksBannedHtml) {
      console.log("❌ Cloudflare indicates your IP is banned (Error 1006 / access denied).");
      console.log("   You’ll see this regardless of whether the API key is valid.");
    } else if (withAuth.status === 200) {
      console.log("✅ Rebrickable reachable, and your API key appears valid.");
    } else if (withAuth.status === 401 || withAuth.status === 403) {
      console.log("⚠️ API reachable, but key might be invalid or forbidden.");
      console.log("   Check the JSON snippet above for details.");
    } else {
      console.log("⚠️ Unexpected status from /colors with key:", withAuth.status);
    }
  } else {
    console.log("\n=== Summary ===");
    console.log("⚠️ Skipped API key validation (REBRICKABLE_API_KEY not set).");
    if (base.error || noAuth.error) {
      console.log("❌ There were network-level errors.");
    }
  }

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
