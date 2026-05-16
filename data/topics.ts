import topicsJson from './topics.json';

export interface Sentence {
  en: string;
  ja: string;
  audioPath?: string;
}

export interface Topic {
  id: string;
  title: string;
  titleJa?: string;
  category: string;
  sentences: Sentence[];
  createdAt?: string;
}

export const topics: Topic[] = topicsJson as Topic[];
