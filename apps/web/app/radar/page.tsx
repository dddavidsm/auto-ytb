import { requireSession } from '../../lib/auth';
import RadarClient from './radar-client';

export const dynamic = 'force-dynamic';

export default async function RadarPage() {
  await requireSession();
  return <RadarClient />;
}
