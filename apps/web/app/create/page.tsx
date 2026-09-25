import { requireSession } from '../../lib/auth';
import StudioForm from './studio-form';

export const dynamic = 'force-dynamic';

export default async function CreatePage() {
  await requireSession();
  return <StudioForm />;
}
