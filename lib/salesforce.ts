import type { InstallationData } from "@/types/installation";

export interface CreateCaseInput {
  installation: InstallationData;
  problemType: string;
  description: string;
}

export async function createCase(_input: CreateCaseInput): Promise<{ caseId: string }> {
  // TODO: authenticate against Salesforce and create a Case record
  throw new Error("Salesforce API not yet implemented");
}
