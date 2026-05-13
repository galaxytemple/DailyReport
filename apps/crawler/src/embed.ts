import { Ollama } from 'ollama';

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? 'http://localhost:11434' });

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) throw new Error('embedText: empty input');
  const res = await ollama.embed({ model: 'nomic-embed-text', input: trimmed });
  return res.embeddings[0];
}
