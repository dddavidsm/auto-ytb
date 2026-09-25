import { requireSession } from '../../lib/auth';
import IdeaLabClient from './idea-lab-client';

export const dynamic = 'force-dynamic';

export default async function IdeaLabPage() {
  await requireSession();
  return <IdeaLabClient />;
}
