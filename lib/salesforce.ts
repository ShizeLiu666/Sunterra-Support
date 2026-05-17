export interface CreateCaseInput {
  subject: string;
  description: string;
  contactName?: string;
  contactAddress?: string;
  deviceSn?: string;
  plantId?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: Buffer }>;
}

export interface CreateCaseResult {
  caseId: string;
  caseNumber?: string;
}

export async function createCase(_input: CreateCaseInput): Promise<CreateCaseResult> {
  // TODO: authenticate against Salesforce and create a Case record
  throw new Error("createCase not yet implemented");
}
