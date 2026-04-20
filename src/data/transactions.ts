import type {
  Account,
  Category,
  Confidence,
  MerchantRule,
  PersonalExpenseNote,
  Transaction,
  VatRate,
  VatStatus,
} from '../types';

/**
 * UK corporation tax context. The tax year runs 6 April to 5 April.
 * With TODAY = 2026-04-18, we're a couple of weeks into the new tax year,
 * so the "previous" year is the one users are actually closing out.
 */
export const TODAY = '2026-04-18';
export const UK_TAX_YEAR_CURRENT_START = '2026-04-06';
export const UK_TAX_YEAR_CURRENT_END = '2027-04-05';
export const UK_TAX_YEAR_PREVIOUS_START = '2025-04-06';
export const UK_TAX_YEAR_PREVIOUS_END = '2026-04-05';

/**
 * Merchants whose genuine-looking business charges occasionally come through
 * as personal. Used to seed borderline cases that the reviewer has to think
 * about, rather than waving through.
 */
const BORDERLINE_PERSONAL_MERCHANTS: readonly string[] = [
  'Uber',
  'TfL',
  'Pret',
  'Caffè Nero',
  'Deliveroo',
  'Amazon',
];

/**
 * Obvious-personal merchant names that appear alongside the business merchant
 * list. These give the user clear-cut personal items (weekly shop, streaming,
 * personal Amazon orders) to see the flow work on.
 */
const CLEAR_PERSONAL_MERCHANTS: readonly {
  name: string;
  descriptions: readonly string[];
  min: number;
  max: number;
}[] = [
  {
    name: 'Netflix',
    descriptions: ['Premium plan, monthly'],
    min: 10.99,
    max: 17.99,
  },
  {
    name: 'Spotify',
    descriptions: ['Family plan, monthly'],
    min: 9.99,
    max: 19.99,
  },
  {
    name: 'Ocado',
    descriptions: ['Weekly grocery order'],
    min: 38,
    max: 180,
  },
];

/**
 * Business-shaped merchants that the user has (perhaps wrongly) flagged as
 * personal. Seeding a few of these gives the user something to push back
 * against: the flow should make moving back to business feel safe.
 */
const WRONGLY_PERSONAL_MERCHANTS: readonly string[] = [
  'WeWork',
  'Adobe',
  'LinkedIn Ads',
];

/**
 * Merchants where a single category rule is genuinely not appropriate.
 * For these, the "Apply to other?" moment pre-selects "Just this one"
 * and shows helper copy explaining why we don't suggest a rule.
 */
export const AMBIGUOUS_MERCHANTS: readonly string[] = [
  'Amazon',
  'PayPal',
  'Stripe',
  'Google',
  'Apple',
  'Tesco',
  "Sainsbury's",
];

/** Seeded merchant rules so the Rules view isn't empty on first load. */
export const INITIAL_RULES: MerchantRule[] = [
  {
    id: 'rule_mailchimp',
    merchant: 'Mailchimp',
    category: 'Marketing',
    createdAt: '2026-03-02T10:12:00.000Z',
    appliedToPastCount: 4,
  },
  {
    id: 'rule_tfl',
    merchant: 'TfL',
    category: 'Travel',
    createdAt: '2026-02-14T09:04:00.000Z',
    appliedToPastCount: 27,
  },
  {
    id: 'rule_wework',
    merchant: 'WeWork',
    category: 'Utilities',
    createdAt: '2026-01-09T15:38:00.000Z',
    appliedToPastCount: 3,
  },
];

export const VAT_ELIGIBLE_CATEGORIES: readonly Category[] = [
  'Software subscriptions',
  'Travel',
  'Meals and entertainment',
  'Office supplies',
  'Marketing',
  'Professional services',
  'Equipment',
  'Utilities',
];

export const DEFAULT_VAT_RATES: Record<Category, VatRate> = {
  'Software subscriptions': 20,
  Travel: 0,
  'Meals and entertainment': 0,
  'Office supplies': 20,
  Marketing: 20,
  'Professional services': 20,
  Equipment: 20,
  Utilities: 20,
  'Tax and government': 0,
  Income: 0,
  Personal: 0,
};

export function isVatEligible(category: Category): boolean {
  return VAT_ELIGIBLE_CATEGORIES.includes(category);
}

export function calcVatFromGross(gross: number, rate: VatRate): number {
  if (rate === 0) return 0;
  const value = gross - gross / (1 + rate / 100);
  return Math.round(value * 100) / 100;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260418);
const rand = () => rnd();
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;
const range = (min: number, max: number) =>
  Math.round((min + rand() * (max - min)) * 100) / 100;

type MerchantProfile = {
  name: string;
  descriptions: readonly string[];
  category: Category;
  min: number;
  max: number;
  weight: number;
  vatLikely: 'yes' | 'no' | 'mixed';
  accountBias?: Account;
};

const MERCHANTS: readonly MerchantProfile[] = [
  {
    name: 'Tesco',
    descriptions: ['Tesco Express', 'Tesco Metro', 'Tesco Superstore'],
    category: 'Office supplies',
    min: 3,
    max: 80,
    weight: 8,
    vatLikely: 'mixed',
  },
  {
    name: "Sainsbury's",
    descriptions: ["Sainsbury's Local", "Sainsbury's Central"],
    category: 'Meals and entertainment',
    min: 2,
    max: 55,
    weight: 5,
    vatLikely: 'mixed',
  },
  {
    name: 'Uber',
    descriptions: ['Uber trip', 'Uber Reserve', 'Uber to client meeting'],
    category: 'Travel',
    min: 6,
    max: 48,
    weight: 10,
    vatLikely: 'no',
  },
  {
    name: 'TfL',
    descriptions: ['Contactless journey', 'Oyster top-up'],
    category: 'Travel',
    min: 1.5,
    max: 25,
    weight: 9,
    vatLikely: 'no',
  },
  {
    name: 'Amazon',
    descriptions: [
      'Amazon Marketplace',
      'Amazon Business',
      'Amazon office supplies',
    ],
    category: 'Office supplies',
    min: 5,
    max: 420,
    weight: 9,
    vatLikely: 'yes',
  },
  {
    name: 'Mailchimp',
    descriptions: ['Monthly subscription', 'Standard plan'],
    category: 'Software subscriptions',
    min: 15,
    max: 120,
    weight: 3,
    vatLikely: 'yes',
  },
  {
    name: 'Google Workspace',
    descriptions: ['Business Standard, 3 seats', 'Workspace monthly'],
    category: 'Software subscriptions',
    min: 18,
    max: 180,
    weight: 4,
    vatLikely: 'yes',
  },
  {
    name: 'Slack',
    descriptions: ['Pro plan, monthly', 'Pro plan, annual'],
    category: 'Software subscriptions',
    min: 8,
    max: 240,
    weight: 3,
    vatLikely: 'yes',
  },
  {
    name: 'Figma',
    descriptions: ['Professional seat', 'Organisation seats'],
    category: 'Software subscriptions',
    min: 12,
    max: 410,
    weight: 3,
    vatLikely: 'yes',
  },
  {
    name: 'Notion',
    descriptions: ['Plus plan', 'Team seats'],
    category: 'Software subscriptions',
    min: 8,
    max: 90,
    weight: 2,
    vatLikely: 'yes',
  },
  {
    name: 'Adobe',
    descriptions: ['Creative Cloud', 'Acrobat Pro'],
    category: 'Software subscriptions',
    min: 20,
    max: 85,
    weight: 3,
    vatLikely: 'yes',
  },
  {
    name: 'WeWork',
    descriptions: ['Hot desk, monthly', 'Meeting room booking'],
    category: 'Utilities',
    min: 180,
    max: 1200,
    weight: 2,
    vatLikely: 'yes',
  },
  {
    name: 'British Airways',
    descriptions: ['LHR to DUB return', 'LHR to EDI', 'LHR to CDG'],
    category: 'Travel',
    min: 90,
    max: 1180,
    weight: 2,
    vatLikely: 'mixed',
  },
  {
    name: 'easyJet',
    descriptions: ['LGW to AMS', 'LGW to BCN', 'STN to DUB'],
    category: 'Travel',
    min: 32,
    max: 380,
    weight: 3,
    vatLikely: 'mixed',
  },
  {
    name: 'Deliveroo',
    descriptions: ['Team lunch', 'Late night order', 'Client lunch'],
    category: 'Meals and entertainment',
    min: 14,
    max: 72,
    weight: 6,
    vatLikely: 'mixed',
  },
  {
    name: 'Pret',
    descriptions: ['Pret A Manger', 'Pret at the airport'],
    category: 'Meals and entertainment',
    min: 3,
    max: 24,
    weight: 7,
    vatLikely: 'mixed',
  },
  {
    name: 'Caffè Nero',
    descriptions: ['Coffee', 'Client coffee'],
    category: 'Meals and entertainment',
    min: 2.5,
    max: 18,
    weight: 5,
    vatLikely: 'mixed',
  },
  {
    name: 'Stripe',
    descriptions: ['Processing fees', 'Dispute fee'],
    category: 'Professional services',
    min: 4,
    max: 320,
    weight: 4,
    vatLikely: 'no',
  },
  {
    name: 'HMRC',
    descriptions: ['VAT return payment', 'PAYE', 'Corporation tax'],
    category: 'Tax and government',
    min: 180,
    max: 12000,
    weight: 2,
    vatLikely: 'no',
  },
  {
    name: 'Companies House',
    descriptions: ['Annual confirmation', 'Filing fee'],
    category: 'Tax and government',
    min: 13,
    max: 150,
    weight: 1,
    vatLikely: 'no',
  },
  {
    name: 'British Gas',
    descriptions: ['Office energy, monthly'],
    category: 'Utilities',
    min: 40,
    max: 260,
    weight: 2,
    vatLikely: 'yes',
  },
  {
    name: 'BT Business',
    descriptions: ['Broadband & phone'],
    category: 'Utilities',
    min: 35,
    max: 120,
    weight: 2,
    vatLikely: 'yes',
  },
  {
    name: 'LinkedIn Ads',
    descriptions: ['Sponsored campaign', 'Lead gen campaign'],
    category: 'Marketing',
    min: 45,
    max: 1400,
    weight: 2,
    vatLikely: 'yes',
  },
  {
    name: 'Meta Ads',
    descriptions: ['Instagram campaign', 'Retargeting campaign'],
    category: 'Marketing',
    min: 30,
    max: 900,
    weight: 2,
    vatLikely: 'yes',
  },
  {
    name: 'John Lewis',
    descriptions: ['Office chair', 'Monitor', 'Desk lamp'],
    category: 'Equipment',
    min: 60,
    max: 900,
    weight: 1,
    vatLikely: 'yes',
  },
  {
    name: 'Apple',
    descriptions: ['MacBook Pro', 'iPad', 'Accessories'],
    category: 'Equipment',
    min: 40,
    max: 2400,
    weight: 2,
    vatLikely: 'yes',
  },
  {
    name: 'Rocket Lawyer',
    descriptions: ['Contract review', 'Legal templates, annual'],
    category: 'Professional services',
    min: 20,
    max: 480,
    weight: 1,
    vatLikely: 'yes',
  },
  {
    name: 'Xero',
    descriptions: ['Accounting, monthly'],
    category: 'Software subscriptions',
    min: 16,
    max: 70,
    weight: 2,
    vatLikely: 'yes',
  },
];

const CLIENTS: readonly string[] = [
  'Northbridge Ltd',
  'Parallax Studios',
  'Hemlock & Pine',
  'Sable Interiors',
  'Meridian Labs',
  'Finchwood Partners',
  'Halcyon Retail',
  'Old Street Co-op',
];

const ALL_CATEGORIES: readonly Category[] = [
  'Software subscriptions',
  'Travel',
  'Meals and entertainment',
  'Office supplies',
  'Marketing',
  'Professional services',
  'Equipment',
  'Utilities',
  'Tax and government',
  'Income',
  'Personal',
];

const AI_REASONING_BY_SWAP: Record<string, readonly string[]> = {
  'Office supplies->Meals and entertainment': [
    'Tesco receipts for food items usually lean towards team meals rather than supplies.',
    'Items on this receipt look like snacks and drinks rather than stationery.',
  ],
  'Meals and entertainment->Personal': [
    'Weekend evening order with no note suggests this could be personal.',
    'Small café charge outside working hours could be personal spending.',
  ],
  'Software subscriptions->Marketing': [
    'This Mailchimp tier is often used for campaigns rather than general tooling.',
    'Annual plan charges here sometimes sit under marketing budgets.',
  ],
  'Travel->Personal': [
    'Late-night Uber to a residential postcode looks personal rather than business.',
    'This TfL day is outside your usual travel pattern, could be personal.',
  ],
  'Office supplies->Equipment': [
    'Amazon purchase over £100 often indicates equipment rather than supplies.',
    'This order includes hardware-sounding items, could be equipment.',
  ],
  'Professional services->Software subscriptions': [
    'Stripe fees can sometimes be split out as a platform cost rather than a service.',
  ],
  'Utilities->Office supplies': [
    'Small one-off charge from WeWork often relates to meeting room catering rather than rent.',
  ],
};

function pickSwap(from: Category): { to: Category; reasoning: string } {
  const candidates = Object.keys(AI_REASONING_BY_SWAP)
    .filter((k) => k.startsWith(from + '->'))
    .map((k) => k.split('->')[1] as Category);
  const to: Category =
    candidates.length > 0
      ? pick(candidates)
      : (pick(ALL_CATEGORIES.filter((c) => c !== from)) as Category);
  const key = `${from}->${to}`;
  const lines = AI_REASONING_BY_SWAP[key];
  const reasoning = lines
    ? pick(lines)
    : 'A similar transaction last month was categorised differently.';
  return { to, reasoning };
}

const DAY_MS = 86_400_000;

function isoDate(daysAgo: number): string {
  const today = new Date('2026-04-18T12:00:00Z');
  const d = new Date(today.getTime() - daysAgo * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function weightedMerchant(): MerchantProfile {
  const total = MERCHANTS.reduce((s, m) => s + m.weight, 0);
  let r = rand() * total;
  for (const m of MERCHANTS) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return MERCHANTS[0]!;
}

function accountFor(m: MerchantProfile): Account {
  if (m.accountBias) return m.accountBias;
  const r = rand();
  if (r < 0.7) return 'ANNA Business';
  if (r < 0.9) return 'Connected Barclays';
  return 'Connected Starling';
}

/**
 * Seed a personalExpenseNote for a personal transaction. Roughly half get
 * nothing (user hasn't looked at it yet), a quarter have a reason written
 * but aren't reviewed, and a quarter are fully reviewed for corp tax.
 */
function seedPersonalNote(
  daysAgo: number,
  merchantName: string,
): { note?: PersonalExpenseNote; reviewedDaysAgo?: number } {
  const r = rand();
  if (r < 0.5) return {};

  const reasons: Record<string, readonly string[]> = {
    Ocado: ['Personal weekly shop', 'Home groceries'],
    Netflix: ['Personal streaming', 'Family account'],
    Spotify: ['Personal account'],
    Tesco: ['Household shop, not office', 'Personal groceries'],
    "Sainsbury's": ['Household groceries'],
    Uber: ['Weekend trip, not client', 'Personal, not business travel'],
    TfL: ['Weekend travel, personal'],
    Pret: ['Personal breakfast'],
    'Caffè Nero': ['Personal coffee, not client'],
    Deliveroo: ['Personal takeaway', 'Family order'],
    Amazon: ['Personal Amazon order, not office', 'Gift, not for business'],
  };
  const reason =
    reasons[merchantName]?.[0] ??
    pick(['Personal, not business', 'Not for the company', 'Family expense']);

  if (r < 0.75) {
    return {
      note: { reason, reviewedForCorpTax: false },
    };
  }

  const reviewedDaysAgo = Math.max(0, daysAgo - Math.floor(rand() * 30) - 1);
  return {
    note: {
      reason,
      reviewedForCorpTax: true,
      reviewedAt: new Date(
        new Date('2026-04-18T12:00:00Z').getTime() - reviewedDaysAgo * DAY_MS,
      ).toISOString(),
    },
    reviewedDaysAgo,
  };
}

function buildClearPersonalTransaction(idx: number): Transaction {
  const m = pick(CLEAR_PERSONAL_MERCHANTS);
  const gross = range(m.min, m.max);
  const amount = -gross;
  const daysAgo = Math.floor(rand() * 365);
  const description = pick(m.descriptions);

  const seeded = seedPersonalNote(daysAgo, m.name);

  return {
    id: `txn_${idx.toString().padStart(4, '0')}`,
    date: isoDate(daysAgo),
    merchant: m.name,
    description,
    amount: Math.round(amount * 100) / 100,
    currency: 'GBP',
    category: 'Personal',
    categoryConfidence: 'high',
    categorySource: 'ai',
    vatStatus: 'not-applicable',
    receiptAttached: false,
    receiptRequired: false,
    isPersonal: true,
    personalExpenseNote: seeded.note,
    personalHistory: [
      {
        toPersonal: true,
        changedAt: isoDate(daysAgo) + 'T12:00:00.000Z',
        source: 'manual',
      },
    ],
    reviewed: seeded.note?.reviewedForCorpTax === true,
    account: chance(0.5) ? 'Connected Barclays' : 'ANNA Business',
  };
}

function buildTransaction(idx: number): Transaction {
  // Inject obvious-personal merchants a chunk of the time, so the Personal
  // view has clear-cut items alongside the borderline cases.
  if (chance(0.07)) {
    return buildClearPersonalTransaction(idx);
  }

  const isIncome = chance(0.06);

  if (isIncome) {
    const client = pick(CLIENTS);
    const amount = range(320, 8400);
    const daysAgo = Math.floor(rand() * 365);
    return {
      id: `txn_${idx.toString().padStart(4, '0')}`,
      date: isoDate(daysAgo),
      merchant: client,
      description: `Invoice payment from ${client}`,
      amount: Math.round(amount * 100) / 100,
      currency: 'GBP',
      category: 'Income',
      categoryConfidence: 'high',
      categorySource: 'ai',
      vatStatus: 'not-applicable',
      receiptAttached: false,
      receiptRequired: false,
      isPersonal: false,
      reviewed: chance(0.55),
      account: chance(0.85) ? 'ANNA Business' : 'Connected Barclays',
    };
  }

  const m = weightedMerchant();
  const gross = range(m.min, m.max);
  const amount = -gross;
  const daysAgo = Math.floor(rand() * 365);
  const description = pick(m.descriptions);

  let vatStatus: VatStatus;
  let vatAmount: number | undefined;
  let vatRate: VatRate | undefined;
  // Bias towards more needs-vat items so the "Needs VAT" filter + batch
  // review flow has a meaningful pile to work through in the demo. The
  // specific rates below were tuned so the inbox opens on ~30–40
  // unreviewed needs-vat transactions across a typical seed.
  if (m.vatLikely === 'no') {
    vatStatus = chance(0.6) ? 'not-applicable' : 'needs-vat';
  } else if (m.vatLikely === 'yes') {
    if (chance(0.6)) {
      vatStatus = 'needs-vat';
    } else {
      vatStatus = 'recorded';
      vatRate = 20;
      vatAmount = calcVatFromGross(gross, 20);
    }
  } else {
    const r = rand();
    if (r < 0.65) vatStatus = 'needs-vat';
    else if (r < 0.9) {
      vatStatus = 'recorded';
      vatRate = 20;
      vatAmount = calcVatFromGross(gross, 20);
    } else vatStatus = 'not-applicable';
  }

  const receiptRequired = gross > 10;
  const receiptAttached = receiptRequired ? chance(0.6) : chance(0.2);

  // Tiered personal rate: borderline merchants flip to personal more often,
  // a few business-shaped merchants flip a little (giving the user
  // something to push back against), everything else rarely.
  let personalRate = 0.02;
  if (BORDERLINE_PERSONAL_MERCHANTS.includes(m.name)) personalRate = 0.15;
  else if (WRONGLY_PERSONAL_MERCHANTS.includes(m.name)) personalRate = 0.1;
  const isPersonal = chance(personalRate);

  let category: Category = isPersonal ? 'Personal' : m.category;
  let categoryConfidence: Confidence = chance(0.16)
    ? 'medium'
    : chance(0.12)
    ? 'low'
    : 'high';

  // Demo story: Figma has been miscategorised as 'Office supplies' across
  // all past transactions, so the recategorisation flow has a ready example.
  if (m.name === 'Figma' && !isPersonal) {
    category = 'Office supplies';
    categoryConfidence = chance(0.5) ? 'medium' : 'low';
  }

  let aiSuggestedCategory: Category | undefined;
  let aiReasoning: string | undefined;
  if (categoryConfidence === 'low') {
    const swap = pickSwap(category);
    aiSuggestedCategory = swap.to;
    aiReasoning = swap.reasoning;
  }
  if (m.name === 'Figma' && category === 'Office supplies') {
    aiSuggestedCategory = 'Software subscriptions';
    aiReasoning =
      'Figma is a design subscription, which usually sits under software rather than office supplies.';
  }

  const seeded = isPersonal ? seedPersonalNote(daysAgo, m.name) : {};

  const reviewed = isPersonal
    ? seeded.note?.reviewedForCorpTax === true
    : categoryConfidence === 'high' &&
      vatStatus !== 'needs-vat' &&
      (!receiptRequired || receiptAttached) &&
      chance(0.55);

  return {
    id: `txn_${idx.toString().padStart(4, '0')}`,
    date: isoDate(daysAgo),
    merchant: m.name,
    description,
    amount: Math.round(amount * 100) / 100,
    currency: 'GBP',
    category,
    categoryConfidence,
    categorySource: 'ai',
    aiSuggestedCategory,
    aiReasoning,
    vatAmount,
    vatRate,
    vatEntryMethod: vatStatus === 'recorded' ? 'ai-suggested' : undefined,
    vatStatus,
    receiptAttached,
    receiptRequired,
    receiptFilename: receiptAttached ? `receipt-${idx}.pdf` : undefined,
    isPersonal,
    personalExpenseNote: seeded.note,
    personalHistory: isPersonal
      ? [
          {
            toPersonal: true,
            changedAt: isoDate(daysAgo) + 'T12:00:00.000Z',
            source: 'manual',
          },
        ]
      : undefined,
    reviewed,
    account: accountFor(m),
  };
}

/**
 * Apply the initial seed rules to transactions so the Rules view
 * has believable history to point at.
 */
function applySeedRules(list: Transaction[]): Transaction[] {
  return list.map((t) => {
    const rule = INITIAL_RULES.find(
      (r) => r.merchant === t.merchant && !t.isPersonal,
    );
    if (!rule) return t;
    if (t.category === rule.category) {
      return { ...t, categorySource: 'rule', ruleId: rule.id };
    }
    return {
      ...t,
      category: rule.category,
      categorySource: 'rule',
      ruleId: rule.id,
      categoryConfidence: 'high',
      aiSuggestedCategory: undefined,
      aiReasoning: undefined,
    };
  });
}

function generate(count: number): Transaction[] {
  const list: Transaction[] = [];
  for (let i = 0; i < count; i++) list.push(buildTransaction(i));
  return applySeedRules(list);
}

export const transactions: Transaction[] = generate(300);

if (typeof window !== 'undefined') {
  (window as unknown as { __anna?: unknown }).__anna = {
    transactions,
    summary: {
      total: transactions.length,
      needsVat: transactions.filter((t) => t.vatStatus === 'needs-vat').length,
      missingReceipts: transactions.filter(
        (t) => t.receiptRequired && !t.receiptAttached,
      ).length,
      aiUnsure: transactions.filter((t) => t.categoryConfidence === 'low')
        .length,
      personal: transactions.filter((t) => t.isPersonal).length,
      reviewed: transactions.filter((t) => t.reviewed).length,
    },
  };
}
