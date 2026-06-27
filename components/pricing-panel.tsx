"use client";

import {
  formatInr,
  formatUsd,
  getMonthlyScenarios,
  getPerBuildScenario,
  PRICING_REFERENCE,
  USD_TO_INR,
  usdToInr,
  VERCEL_SANDBOX_RATES,
  VENDOR_LINKS,
} from "@/lib/pricing-inr";

export function PricingPanel() {
  const perBuild = getPerBuildScenario();
  const monthly10 = getMonthlyScenarios(10);
  const monthly50 = getMonthlyScenarios(50);
  const monthly200 = getMonthlyScenarios(200);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-900/40 bg-indigo-950/30 p-4">
        <p className="text-xs leading-relaxed text-indigo-200/90">
          All amounts shown in <strong>INR (₹)</strong> with USD reference.
          Exchange rate used: <strong>₹{USD_TO_INR} = $1 USD</strong> (approximate).
          Actual billing is in USD on Vercel/Google — verify live rates and your plan
          before budgeting.
        </p>
      </div>

      <ScenarioCard scenario={perBuild} highlight />

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-200">
          Monthly end-to-end estimates (Pro plan)
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <ScenarioCard scenario={monthly10} compact />
          <ScenarioCard scenario={monthly50} compact />
          <ScenarioCard scenario={monthly200} compact />
        </div>
      </div>

      <section>
        <h3 className="text-sm font-medium text-zinc-200">Official rate card (INR)</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Sandbox region: {VERCEL_SANDBOX_RATES.region}
        </p>
        <div className="mt-3 space-y-4">
          {PRICING_REFERENCE.map((section) => (
            <div
              key={section.category}
              className="overflow-hidden rounded-xl border border-zinc-800"
            >
              <div className="bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300">
                {section.category}
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-t border-zinc-800 text-zinc-500">
                    <th className="px-3 py-2 font-normal">Item</th>
                    <th className="px-3 py-2 font-normal">USD</th>
                    <th className="px-3 py-2 font-normal">INR (₹)</th>
                    <th className="hidden px-3 py-2 font-normal sm:table-cell">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.item} className="border-t border-zinc-800/80">
                      <td className="px-3 py-2 text-zinc-300">{row.item}</td>
                      <td className="px-3 py-2 text-zinc-400">
                        {row.usd === 0 ? "Free" : formatUsd(row.usd)}
                      </td>
                      <td className="px-3 py-2 font-medium text-zinc-200">
                        {row.inr === 0 ? "₹0" : formatInr(row.inr)}
                      </td>
                      <td className="hidden px-3 py-2 text-zinc-500 sm:table-cell">
                        {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
        <h3 className="text-sm font-medium text-zinc-200">What SCORM Forge uses per build</h3>
        <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
          <li>• <strong className="text-zinc-300">Gemini API</strong> — authors interactive lesson code (~{formatInr(usdToInr(perBuild.items[0].usd))} per build)</li>
          <li>• <strong className="text-zinc-300">Vercel Sandbox</strong> — live lesson preview (~{formatInr(usdToInr(perBuild.items[1].usd))} per session)</li>
          <li>• <strong className="text-zinc-300">Vercel Functions</strong> — /api/chat routes (~{formatInr(usdToInr(perBuild.items[2].usd))} per request)</li>
          <li>• <strong className="text-zinc-300">Local preview</strong> — free, runs in browser</li>
          <li>• <strong className="text-zinc-300">SCORM export</strong> — free, packaged locally (Three.js/R3F via CDN in ZIP)</li>
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-200">Source links</h3>
        <ul className="mt-2 space-y-1">
          {VENDOR_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:underline"
              >
                {link.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ScenarioCard({
  scenario,
  highlight = false,
  compact = false,
}: {
  scenario: ReturnType<typeof getPerBuildScenario>;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-emerald-900/50 bg-emerald-950/20"
          : "border-zinc-800 bg-zinc-950/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-zinc-100">{scenario.title}</h4>
          {!compact && (
            <p className="mt-1 text-xs text-zinc-500">{scenario.description}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold text-emerald-400">
            {formatInr(usdToInr(scenario.totalUsd))}
          </p>
          <p className="text-[11px] text-zinc-500">{formatUsd(scenario.totalUsd)}</p>
        </div>
      </div>
      {!compact && (
        <ul className="mt-3 space-y-2 border-t border-zinc-800/80 pt-3">
          {scenario.items.map((item) => (
            <li key={item.label} className="flex justify-between gap-3 text-xs">
              <span className="text-zinc-400">
                {item.label}
                {item.note && (
                  <span className="mt-0.5 block text-[10px] text-zinc-600">
                    {item.note}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-zinc-300">
                {formatInr(usdToInr(item.usd))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {compact && (
        <p className="mt-2 text-[11px] text-zinc-500">{scenario.description}</p>
      )}
    </div>
  );
}
