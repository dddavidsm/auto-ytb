export type TopicDocument = { id: string; text: string };
export type TopicCluster = { id: string; label: string; documentIds: string[]; terms: string[] };

const STOP = new Set(['the','a','an','and','or','of','to','in','on','for','with','is','are','was','were','why','how','what','this','that','new','explained','documentary']);

function stem(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function topicTerms(text: string): string[] {
  return [...new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map(stem)
      .filter((token) => token.length > 2 && !STOP.has(token)),
  )];
}

export function topicSimilarity(a: string, b: string): number {
  const left = new Set(topicTerms(a));
  const right = new Set(topicTerms(b));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const term of left) if (right.has(term)) overlap += 1;
  const union = new Set([...left, ...right]).size;
  const containment = overlap / Math.min(left.size, right.size);
  const jaccard = overlap / union;
  return Math.round(Math.max(jaccard, containment * 0.82) * 1000) / 10;
}

export function clusterTopics(documents: TopicDocument[], threshold = 48): TopicCluster[] {
  const clusters: TopicCluster[] = [];
  for (const document of documents) {
    let bestIndex = -1;
    let bestScore = threshold;
    for (let i = 0; i < clusters.length; i += 1) {
      const score = topicSimilarity(document.text, clusters[i]!.label);
      if (score >= bestScore) {
        bestIndex = i;
        bestScore = score;
      }
    }
    if (bestIndex === -1) {
      clusters.push({
        id: `topic-${String(clusters.length + 1).padStart(3, '0')}`,
        label: document.text,
        documentIds: [document.id],
        terms: topicTerms(document.text),
      });
    } else {
      const cluster = clusters[bestIndex]!;
      cluster.documentIds.push(document.id);
      cluster.terms = [...new Set([...cluster.terms, ...topicTerms(document.text)])];
    }
  }
  return clusters.sort((a, b) => b.documentIds.length - a.documentIds.length);
}
