import Image from 'next/image';
import { ArrowUpRight, Download, MessageCircle } from 'lucide-react';
import type { Locale } from '../../shared/locale-core';
import './line-oa-invite.css';

// This is the destination encoded in the original OA QR supplied by the owner.
const LINE_OA_URL = 'https://lin.ee/YtumF8t';
const LINE_OA_QR = '/line/chordjai-line-oa-qr.png';

export function LineOaInvite({ locale, placement = 'intro' }: {
  locale: Locale;
  placement?: 'intro' | 'footer';
}) {
  const t = (th: string, en: string) => locale === 'en' ? en : th;
  const footer = placement === 'footer';
  const Container = footer ? 'aside' : 'section';
  const Heading = footer ? 'h3' : 'h2';
  const headingId = `line-oa-${placement}-title`;
  return (
    <Container
      className={`cj-line-invite${footer ? ' cj-line-invite-footer' : ' cj-wrap'}`}
      aria-labelledby={headingId}
    >
      <div className="cj-line-invite-copy">
        <div className="cj-line-invite-identity">
          <Image src="/brand/chordjai-emblem.png" alt="" width={72} height={72} />
          <div>
            <span className="cj-line-invite-label">ChordJai · LINE Official Account</span>
            <Heading id={headingId}>
              {footer
                ? t('มีเรื่องของน้อง ทักชิดใจได้เลย', 'A little update? Tell ChordJai.')
                : t('เล่าเรื่องน้องได้เลย ใน LINE', 'Their little stories. Right here on LINE.')}
            </Heading>
          </div>
        </div>
        <p>
          {t(
            'เพิ่มเพื่อนชิดใจ แล้วพิมพ์ขอให้ช่วยบันทึกเรื่องของน้อง เริ่มจากเรื่องเล็ก ๆ ของวันนี้ก็ได้',
            'Add ChordJai as a friend and ask us to save an update about your pet. A little thing from today is a lovely place to start.',
          )}
        </p>
        <a className="cj-line-add" href={LINE_OA_URL}>
          <MessageCircle size={19} aria-hidden="true" />
          {t('เพิ่มเพื่อนใน LINE', 'Add us on LINE')}
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
        <span className="cj-line-invite-hint">
          {t('ใช้มือถืออยู่? กดปุ่มเพื่อเปิด LINE ได้เลย', 'On your phone? Tap the button to open LINE.')}
        </span>
      </div>
      <figure className="cj-line-invite-qr">
        <a href={LINE_OA_URL} aria-label={t('เปิด LINE เพื่อเพิ่มเพื่อนชิดใจ', 'Open LINE to add ChordJai')}>
          <Image
            src={LINE_OA_QR}
            alt={t('QR Code เพิ่มเพื่อน LINE ชิดใจ', 'QR code to add ChordJai on LINE')}
            width={540}
            height={540}
            unoptimized
          />
        </a>
        <figcaption>{t('สแกนเพื่อเพิ่มเพื่อน', 'Scan to add us')}</figcaption>
        <a className="cj-line-download" href={LINE_OA_QR} download="chordjai-line-oa-qr.png">
          <Download size={16} aria-hidden="true" />
          {t('บันทึกรูป QR', 'Download QR image')}
        </a>
      </figure>
    </Container>
  );
}
