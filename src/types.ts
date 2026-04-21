export type Account =
  | 'ANNA Business'
  | 'Connected Barclays'
  | 'Connected Starling';

export type Category =
  | 'Software subscriptions'
  | 'Travel'
  | 'Meals and entertainment'
  | 'Office supplies'
  | 'Marketing'
  | 'Professional services'
  | 'Equipment'
  | 'Utilities'
  | 'Tax and government'
  | 'Income'
  | 'Personal';

export type Confidence = 'high' | 'medium' | 'low';

export type VatStatus = 'recorded' | 'not-applicable' | 'needs-vat';

export type VatRate = 0 | 5 | 20;

export type VatEntryMethod = 'manual' | 'receipt' | 'ai-suggested';

export type CategorySource = 'ai' | 'manual' | 'rule';

export type CategoryHistoryEntry = {
  from: Category;
  to: Category;
  changedAt: string;
  source: 'manual' | 'rule' | 'bulk';
};

/**
 * Optional note attached to a transaction that's been flagged as a personal
 * expense. Used for the corporation-tax review flow.
 */
export type PersonalExpenseNote = {
  reason?: string;
  reviewedForCorpTax: boolean;
  reviewedAt?: string;
};

/**
 * Log of personal <-> business toggles, so the audit-trail popover can show a
 * chronology of the user's decisions.
 */
export type PersonalHistoryEntry = {
  toPersonal: boolean;
  changedAt: string;
  source: 'manual' | 'bulk' | 'year-end';
};

export type Transaction = {
  id: string;
  date: string;
  merchant: string;
  description: string;
  amount: number;
  currency: 'GBP';
  category: Category;
  categoryConfidence: Confidence;
  categorySource: CategorySource;
  ruleId?: string;
  categoryHistory?: CategoryHistoryEntry[];
  aiSuggestedCategory?: Category;
  aiReasoning?: string;
  vatAmount?: number;
  vatRate?: VatRate;
  vatEntryMethod?: VatEntryMethod;
  vatEnteredAt?: string;
  vatStatus: VatStatus;
  receiptAttached: boolean;
  receiptRequired: boolean;
  receiptFilename?: string;
  receiptUploadedAt?: string;
  /** Base64 data URL for image receipts. Omitted for PDFs. */
  receiptDataUrl?: string;
  /** MIME type of the uploaded receipt; drives thumbnail vs icon rendering. */
  receiptMimeType?: 'image/jpeg' | 'image/png' | 'application/pdf';
  isPersonal: boolean;
  personalExpenseNote?: PersonalExpenseNote;
  personalHistory?: PersonalHistoryEntry[];
  reviewed: boolean;
  /**
   * Set when the user deliberately marked a receipt-required transaction
   * as reviewed without attaching a receipt. Surfaced as a subtle caveat
   * in the detail panel so the decision isn't invisible after the fact.
   */
  reviewedWithoutReceipt?: boolean;
  account: Account;
};

export type MerchantRule = {
  id: string;
  merchant: string;
  category: Category;
  createdAt: string;
  appliedToPastCount: number;
};

export type FilterKey =
  | 'needs-vat'
  | 'missing-receipts'
  | 'ai-unsure'
  | 'personal'
  | 'from-rules'
  /** Only available in the "All transactions" view. */
  | 'reviewed';

export type DateRangeKey =
  | 'all'
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'this-tax-year'
  | 'custom';

export type AccountFilter = 'all' | Account;

export type TaxYearKey = 'current' | 'previous' | 'all';
