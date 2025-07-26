import type { Database } from '@database/types/database.types';

export interface TestBill {
  bill_number: string;
  congress_number: number;
  bill_type: string;
  title: string;
  summary?: string;
  sponsor?: string;
  introduced_date: string;
  status: string;
  chamber: string;
  committee?: string;
  cosponsors?: any[];
  actions?: any[];
}

export const sampleBills: TestBill[] = [
  {
    bill_number: 'HR-1000',
    congress_number: 118,
    bill_type: 'hr',
    title: 'Clean Energy Investment Act',
    summary: 'A bill to promote clean energy investments and reduce carbon emissions through tax incentives and federal funding for renewable energy projects.',
    sponsor: 'Rep. Jane Smith (D-CA)',
    introduced_date: '2024-01-15',
    status: 'introduced',
    chamber: 'house',
    committee: 'Energy and Commerce',
    cosponsors: [
      { name: 'Rep. John Doe (D-NY)', party: 'D', state: 'NY' },
      { name: 'Rep. Alice Johnson (D-WA)', party: 'D', state: 'WA' }
    ],
    actions: [
      { date: '2024-01-15', action: 'Introduced in House', chamber: 'house' },
      { date: '2024-01-16', action: 'Referred to Committee on Energy and Commerce', chamber: 'house' }
    ]
  },
  {
    bill_number: 'S-500',
    congress_number: 118,
    bill_type: 's',
    title: 'Healthcare Access Improvement Act',
    summary: 'A comprehensive bill to expand healthcare access in rural areas through telehealth services, funding for rural hospitals, and medical professional training programs.',
    sponsor: 'Sen. Robert Brown (D-VT)',
    introduced_date: '2024-02-01',
    status: 'referred',
    chamber: 'senate',
    committee: 'Health, Education, Labor and Pensions',
    cosponsors: [
      { name: 'Sen. Maria Garcia (D-TX)', party: 'D', state: 'TX' },
      { name: 'Sen. Michael Wilson (I-ME)', party: 'I', state: 'ME' }
    ],
    actions: [
      { date: '2024-02-01', action: 'Introduced in Senate', chamber: 'senate' },
      { date: '2024-02-02', action: 'Referred to Committee on Health, Education, Labor and Pensions', chamber: 'senate' }
    ]
  },
  {
    bill_number: 'HR-2001',
    congress_number: 118,
    bill_type: 'hr',
    title: 'Infrastructure Modernization and Jobs Act',
    summary: 'A major infrastructure bill focusing on updating bridges, roads, and digital infrastructure while creating jobs in construction and technology sectors.',
    sponsor: 'Rep. David Lee (R-TX)',
    introduced_date: '2024-01-20',
    status: 'passed_house',
    chamber: 'house',
    committee: 'Transportation and Infrastructure',
    cosponsors: [
      { name: 'Rep. Sarah Connor (R-FL)', party: 'R', state: 'FL' },
      { name: 'Rep. James Miller (D-OH)', party: 'D', state: 'OH' }
    ],
    actions: [
      { date: '2024-01-20', action: 'Introduced in House', chamber: 'house' },
      { date: '2024-01-21', action: 'Referred to Committee on Transportation and Infrastructure', chamber: 'house' },
      { date: '2024-02-15', action: 'Reported by Committee', chamber: 'house' },
      { date: '2024-03-01', action: 'Passed House by voice vote', chamber: 'house' },
      { date: '2024-03-02', action: 'Received in Senate', chamber: 'senate' }
    ]
  },
  {
    bill_number: 'S-750',
    congress_number: 118,
    bill_type: 's',
    title: 'Cybersecurity Enhancement Act',
    summary: 'Legislation to strengthen national cybersecurity defenses, protect critical infrastructure, and enhance information sharing between government and private sector.',
    sponsor: 'Sen. Lisa Wang (R-GA)',
    introduced_date: '2024-02-10',
    status: 'reported',
    chamber: 'senate',
    committee: 'Homeland Security and Governmental Affairs',
    cosponsors: [
      { name: 'Sen. Mark Taylor (R-UT)', party: 'R', state: 'UT' },
      { name: 'Sen. Rachel Green (D-OR)', party: 'D', state: 'OR' }
    ],
    actions: [
      { date: '2024-02-10', action: 'Introduced in Senate', chamber: 'senate' },
      { date: '2024-02-11', action: 'Referred to Committee on Homeland Security and Governmental Affairs', chamber: 'senate' },
      { date: '2024-03-15', action: 'Committee markup held', chamber: 'senate' },
      { date: '2024-03-20', action: 'Reported by Committee with amendments', chamber: 'senate' }
    ]
  },
  {
    bill_number: 'HR-3500',
    congress_number: 118,
    bill_type: 'hr',
    title: 'Student Loan Reform Act',
    summary: 'A bill to reform student loan programs, provide debt relief options, and increase funding for Pell Grants and community college programs.',
    sponsor: 'Rep. Jennifer Lopez (D-NV)',
    introduced_date: '2024-03-01',
    status: 'introduced',
    chamber: 'house',
    committee: 'Education and Labor',
    cosponsors: [
      { name: 'Rep. Kevin Park (D-CA)', party: 'D', state: 'CA' },
      { name: 'Rep. Amanda Davis (D-IL)', party: 'D', state: 'IL' }
    ],
    actions: [
      { date: '2024-03-01', action: 'Introduced in House', chamber: 'house' },
      { date: '2024-03-02', action: 'Referred to Committee on Education and Labor', chamber: 'house' }
    ]
  }
];

export const sampleSearchQueries = [
  'clean energy renewable',
  'healthcare rural access',
  'infrastructure jobs modernization',
  'cybersecurity national defense',
  'student loans debt relief',
  'climate change emissions',
  'education funding schools',
  'immigration border security',
  'veterans benefits healthcare',
  'housing affordable development',
  'agriculture farm bill',
  'tax reform small business',
  'transportation public transit',
  'environmental protection',
  'social security medicare',
  'criminal justice reform',
  'technology privacy rights',
  'international trade',
  'defense spending military',
  'pandemic preparedness'
];

export const testCitations = [
  {
    id: 'citation-1',
    type: 'bill' as const,
    title: 'Clean Energy Investment Act',
    url: 'https://congress.gov/bill/hr-1000',
    relevanceScore: 0.95,
    excerpt: 'A bill to promote **clean energy** investments and reduce carbon emissions',
    billNumber: 'HR-1000',
    sponsor: 'Rep. Jane Smith (D-CA)',
    chamber: 'house',
    status: 'introduced',
    introducedDate: '2024-01-15',
    source: {
      name: 'U.S. Congress',
      type: 'official' as const,
      publishedDate: '2024-01-15',
      author: 'Rep. Jane Smith (D-CA)'
    },
    searchContext: {
      query: 'clean energy renewable',
      searchMethod: 'hybrid' as const,
      rank: 1,
      searchTimestamp: new Date().toISOString(),
      iterationsUsed: 1
    }
  }
];

export function generateRandomBill(overrides: Partial<TestBill> = {}): TestBill {
  const baseId = Math.floor(Math.random() * 10000);
  
  return {
    bill_number: `HR-${baseId}`,
    congress_number: 118,
    bill_type: 'hr',
    title: `Test Bill ${baseId}`,
    summary: `This is a test bill for integration testing purposes. Bill ID: ${baseId}`,
    sponsor: `Rep. Test Sponsor ${baseId} (D-CA)`,
    introduced_date: new Date().toISOString().split('T')[0],
    status: 'introduced',
    chamber: 'house',
    committee: 'Test Committee',
    cosponsors: [],
    actions: [
      {
        date: new Date().toISOString().split('T')[0],
        action: 'Introduced in House',
        chamber: 'house'
      }
    ],
    ...overrides
  };
}

export function createBillInsertData(bill: TestBill): Database['public']['Tables']['bills']['Insert'] {
  return {
    bill_number: bill.bill_number,
    congress_number: bill.congress_number,
    bill_type: bill.bill_type,
    title: bill.title,
    summary: bill.summary || null,
    sponsor: bill.sponsor || null,
    introduced_date: bill.introduced_date,
    status: bill.status,
    chamber: bill.chamber,
    committee: bill.committee || null,
    cosponsors: bill.cosponsors || [],
    actions: bill.actions || []
  };
}