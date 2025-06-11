export interface KarateTest {
    id: string;
    name: string;
    path: string;
    category: string;
    enabled: boolean;
    dataFiles?: string[];
    descriptionFiles?: string[];
    scenarios: string[];
  }
  