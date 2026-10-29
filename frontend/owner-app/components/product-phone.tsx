import Image from "next/image";
import type { Locale } from "../../shared/locale-core";
import { productCaptureSizes } from "./product-capture-sizes";

type ProductScreen =
  | "care-diary"
  | "line-agent"
  | "passport"
  | "memories"
  | "petid";
const screenNames = {
  "care-diary": { th: "ฟอร์มไดอารี่ดูแลน้อง", en: "Care diary entry form" },
  "line-agent": {
    th: "ข้อความตอบกลับจากผู้ช่วยชิดใจใน LINE",
    en: "ChordJai assistant in LIFF",
  },
  passport: {
    th: "เตรียมข้อมูล Pet Passport ก่อนพบหมอ",
    en: "Preparing a Pet Passport",
  },
  memories: { th: "สมุดความทรงจำของน้อง", en: "Your pet’s memory book" },
  petid: { th: "หน้า PetID ของชิดใจ", en: "ChordJai PetID" },
} as const;

/** Actual captures only. No generated interface, device status bar, or changed user text. */
export function ProductPhone({
  screen,
  locale,
}: {
  screen: ProductScreen;
  locale: Locale;
}) {
  const nativeLine = screen === "line-agent" && locale === "th";
  const dimensions = productCaptureSizes[`${screen}-${locale}`];
  return (
    <figure className="product-phone">
      <div className="product-phone-device">
        <div className="product-phone-screen">
          <Image
            src={`/product/${screen}-${locale}.webp`}
            alt={screenNames[screen][locale]}
            width={dimensions.width}
            height={dimensions.height}
            sizes="(max-width: 680px) 280px, 310px"
            loading={screen === "care-diary" ? "eager" : "lazy"}
          />
        </div>
      </div>
      <figcaption className="product-phone-caption">
        {nativeLine
          ? "ส่วนหนึ่งของข้อความตอบกลับจริงจาก LINE บนเดสก์ท็อป"
          : locale === "th"
            ? "ภาพจาก LIFF ของชิดใจที่ใช้งานจริง"
            : screen === "line-agent"
              ? "English assistant memory controls captured from the real LIFF app."
              : "Captured from the real ChordJai LIFF app. Original pet names are preserved."}
      </figcaption>
    </figure>
  );
}
