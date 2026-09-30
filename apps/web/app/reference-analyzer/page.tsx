import { requireSession } from '../../lib/auth';
import ReferenceAnalyzerClient from './reference-analyzer-client';

export const dynamic = 'force-dynamic';

export default async function ReferenceAnalyzerPage() {
  await requireSession();
  return <ReferenceAnalyzerClient />;
}
