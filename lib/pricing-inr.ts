/** Approximate USD → INR rate for cost estimates. Verify before billing. */
export const USD_TO_INR = 84.5;

export function usdToInr(usd: number): number {
  return Math.round(usd * USD_TO_INR * 100) / 100;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount < 100 ? 2 : 0,
  }).format(amount);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount);
}

export type PricingLineItem = {
  label: string;
  usd: number;
  note?: string;
};

export type PricingScenario = {
  id: string;
  title: string;
  description: string;
  items: PricingLineItem[];
  totalUsd: number;
};

export const VERCEL_SANDBOX_RATES = {
  activeCpuPerHour: 0.128,
  memoryPerGbHour: 0.0212,
  creationPerMillion: 0.6,
  dataTransferPerGb: 0.15,
  storagePerGbMonth: 0.08,
  hobbyIncluded: {
    activeCpuHours: 5,
    memoryGbHours: 420,
    creations: 5000,
    dataTransferGb: 20,
  },
  proMonthlyCreditUsd: 20,
  proPlanUsd: 20,
  region: "iad1 (Washington D.C.) — Sandbox runs here only",
  mumbaiFunctionCpuPerHour: 0.14,
  mumbaiFunctionMemoryPerGbHour: 0.0116,
};

export const GEMINI_RATES = {
  model: "Gemini 2.5 Flash (paid tier)",
  inputPerMillionTokens: 0.3,
  outputPerMillionTokens: 2.5,
  freeTierNote:
    "Google AI Studio free tier covers light personal use; paid billing applies above free limits.",
};

/** Typical SCORM Forge build: one chat + sandbox session + preview */
export const SITEFORGE_BUILD_ESTIMATE = {
  geminiInputTokens: 2500,
  geminiOutputTokens: 14000,
  sandboxMinutes: 8,
  sandboxVcpus: 2,
  sandboxMemoryGb: 4,
  functionActiveSeconds: 45,
  functionMemoryGb: 1.7,
  dataTransferMb: 5,
};

function sandboxSessionCost(minutes: number, vcpus: number, memoryGb: number) {
  const hours = minutes / 60;
  const activeCpu = hours * vcpus * VERCEL_SANDBOX_RATES.activeCpuPerHour;
  const memory = hours * memoryGb * VERCEL_SANDBOX_RATES.memoryPerGbHour;
  return {
    activeCpu,
    memory,
    total: activeCpu + memory,
  };
}

function geminiCost(inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * GEMINI_RATES.inputPerMillionTokens +
    (outputTokens / 1_000_000) * GEMINI_RATES.outputPerMillionTokens
  );
}

function functionCost(activeSeconds: number, memoryGb: number) {
  const hours = activeSeconds / 3600;
  return (
    hours * VERCEL_SANDBOX_RATES.mumbaiFunctionCpuPerHour +
    hours * memoryGb * VERCEL_SANDBOX_RATES.mumbaiFunctionMemoryPerGbHour
  );
}

export function getPerBuildScenario(): PricingScenario {
  const e = SITEFORGE_BUILD_ESTIMATE;
  const sandbox = sandboxSessionCost(e.sandboxMinutes, e.sandboxVcpus, e.sandboxMemoryGb);
  const gemini = geminiCost(e.geminiInputTokens, e.geminiOutputTokens);
  const fn = functionCost(e.functionActiveSeconds, e.functionMemoryGb);
  const transfer =
    (e.dataTransferMb / 1024) * VERCEL_SANDBOX_RATES.dataTransferPerGb;
  const creation = 0.0000006;

  const items: PricingLineItem[] = [
    {
      label: `Gemini API (${e.geminiInputTokens.toLocaleString()} in + ${e.geminiOutputTokens.toLocaleString()} out tokens)`,
      usd: gemini,
      note: GEMINI_RATES.model,
    },
    {
      label: `Vercel Sandbox (~${e.sandboxMinutes} min, ${e.sandboxVcpus} vCPU, ${e.sandboxMemoryGb} GB RAM)`,
      usd: sandbox.total,
      note: `Active CPU ${formatUsd(sandbox.activeCpu)} + memory ${formatUsd(sandbox.memory)}`,
    },
    {
      label: `Vercel Functions /api/chat (~${e.functionActiveSeconds}s Fluid compute, Mumbai rates)`,
      usd: fn,
      note: "Serverless route that calls Gemini and writes to sandbox",
    },
    {
      label: "Sandbox data transfer (~5 MB)",
      usd: transfer,
    },
    {
      label: "Sandbox creation (1×)",
      usd: creation,
      note: "Negligible — $0.60 per million creations",
    },
  ];

  const totalUsd = items.reduce((sum, item) => sum + item.usd, 0);
  return {
    id: "per-build",
    title: "Cost per SCORM lesson build",
    description:
      "Typical end-to-end cost for one prompt → interactive lesson → sandbox preview → SCORM export.",
    items,
    totalUsd,
  };
}

export function getMonthlyScenarios(buildsPerMonth: number): PricingScenario {
  const perBuild = getPerBuildScenario();
  const usageUsd = perBuild.totalUsd * buildsPerMonth;
  const proBase = VERCEL_SANDBOX_RATES.proPlanUsd;

  const items: PricingLineItem[] = [
    {
      label: "Vercel Pro subscription",
      usd: proBase,
      note: "Required for production Sandbox on teams; includes $20 (~₹1,690) usage credit",
    },
    {
      label: `${buildsPerMonth} builds × ${formatUsd(perBuild.totalUsd)} each`,
      usd: usageUsd,
      note: "Gemini + Sandbox + Functions combined",
    },
  ];

  const totalBeforeCredit = proBase + usageUsd;
  const credit = VERCEL_SANDBOX_RATES.proMonthlyCreditUsd;
  const billable = Math.max(0, totalBeforeCredit - credit);

  items.push({
    label: "Pro usage credit applied",
    usd: -Math.min(credit, totalBeforeCredit),
    note: "First $20 of metered usage covered by Pro plan",
  });

  return {
    id: `monthly-${buildsPerMonth}`,
    title: `Monthly estimate — ${buildsPerMonth} builds`,
    description:
      billable > 0
        ? `Estimated bill after Pro credit: ${formatUsd(billable)} (${formatInr(usdToInr(billable))})`
        : "Likely fully covered by Pro plan credit for this volume.",
    items,
    totalUsd: billable,
  };
}

export const PRICING_REFERENCE = [
  {
    category: "Vercel Pro (required for Sandbox in production)",
    rows: [
      { item: "Base subscription", usd: 20, inr: usdToInr(20), unit: "/month" },
      {
        item: "Included usage credit",
        usd: 20,
        inr: usdToInr(20),
        unit: "/month (offsets metered Sandbox + Functions)",
      },
    ],
  },
  {
    category: "Vercel Sandbox (metered on Pro)",
    rows: [
      {
        item: "Active CPU",
        usd: 0.128,
        inr: usdToInr(0.128),
        unit: "/vCPU-hour (I/O wait not billed)",
      },
      {
        item: "Provisioned memory",
        usd: 0.0212,
        inr: usdToInr(0.0212),
        unit: "/GB-hour",
      },
      {
        item: "Sandbox creations",
        usd: 0.0000006,
        inr: usdToInr(0.0000006),
        unit: "per creation",
      },
      {
        item: "Data transfer",
        usd: 0.15,
        inr: usdToInr(0.15),
        unit: "/GB",
      },
      {
        item: "Snapshot storage",
        usd: 0.08,
        inr: usdToInr(0.08),
        unit: "/GB-month",
      },
    ],
  },
  {
    category: "Vercel Functions — Mumbai (bom1) Fluid compute",
    rows: [
      {
        item: "Active CPU",
        usd: 0.14,
        inr: usdToInr(0.14),
        unit: "/hour",
      },
      {
        item: "Provisioned memory",
        usd: 0.0116,
        inr: usdToInr(0.0116),
        unit: "/GB-hour",
      },
    ],
  },
  {
    category: "Google Gemini 2.5 Flash API (paid tier)",
    rows: [
      {
        item: "Input tokens",
        usd: 0.3,
        inr: usdToInr(0.3),
        unit: "/1M tokens",
      },
      {
        item: "Output tokens",
        usd: 2.5,
        inr: usdToInr(2.5),
        unit: "/1M tokens",
      },
    ],
  },
  {
    category: "Vercel Hobby (free tier Sandbox limits)",
    rows: [
      {
        item: "Active CPU included",
        usd: 0,
        inr: 0,
        unit: "5 hours/month",
      },
      {
        item: "Memory included",
        usd: 0,
        inr: 0,
        unit: "420 GB-hours/month",
      },
      {
        item: "Max sandbox runtime",
        usd: 0,
        inr: 0,
        unit: "45 minutes (then paused until next cycle)",
      },
    ],
  },
];

export const VENDOR_LINKS = [
  { label: "Vercel Sandbox pricing", href: "https://vercel.com/docs/sandbox/pricing" },
  { label: "Vercel Pro plan", href: "https://vercel.com/docs/plans/pro" },
  { label: "Vercel Fluid compute pricing", href: "https://vercel.com/docs/functions/usage-and-pricing" },
  { label: "Gemini API pricing", href: "https://ai.google.dev/gemini-api/docs/pricing" },
];
