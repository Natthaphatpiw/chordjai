import { redirect } from 'next/navigation';
import { localizedHref } from '../../shared/locale-core';
import { getTranslator } from '../../shared/locale-server';

export default async function Page() {
  const { locale } = await getTranslator();
  redirect(localizedHref('/dashboard', locale));
}
