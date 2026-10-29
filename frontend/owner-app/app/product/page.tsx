import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  Fingerprint,
  Heart,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { localizedHref } from "../../../shared/locale-core";
import { getTranslator } from "../../../shared/locale-server";
import {
  LandingExperience,
  LandingNav,
} from "../../components/landing-interactions";
import { ProductPhone } from "../../components/product-phone";
import "../landing.css";
import "./product.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: t(
      "รู้จักชิดใจ · พื้นที่ของคุณกับน้อง",
      "Explore ChordJai · A space for you and your pet",
    ),
    description: t(
      "ดูการใช้งานจริงของไดอารี่ดูแลน้อง ผู้ช่วยบน LINE, Pet Passport สมุดความทรงจำ และ PetID",
      "Explore the care diary, LINE assistant, Pet Passport, memory book and PetID through real ChordJai screens.",
    ),
  };
}

export default async function ProductPage() {
  const { locale, t } = await getTranslator();
  const href = (path: string) => localizedHref(path, locale);
  const features = [
    {
      id: "care-diary",
      label: t("ไดอารี่ดูแลน้อง", "Care diary"),
      icon: NotebookPen,
    },
    {
      id: "line-agent",
      label: t("ผู้ช่วยบน LINE", "LINE assistant"),
      icon: MessageCircle,
    },
    { id: "passport", label: "Pet Passport", icon: Stethoscope },
    { id: "memories", label: t("สมุดความทรงจำ", "Memory book"), icon: Heart },
    { id: "petid", label: "PetID", icon: Fingerprint },
  ];
  const stories = [
    {
      id: "line-agent" as const,
      number: "02",
      kicker: t("ผู้ช่วยบน LINE", "Your LINE assistant"),
      title: t("เล่าเรื่องน้องผ่านแชต", "Tell their story in chat."),
      continuation: t("แล้วให้ชิดใจช่วยเก็บ", "Let ChordJai help you keep it."),
      text: t(
        "พิมพ์ขอให้บันทึกเรื่องของน้องใน LINE OA ได้เลย ถ้ารายละเอียดยังไม่ครบ ผู้ช่วยจะถามต่อ คุณกดตอบจากตัวเลือกหรือพิมพ์เองได้ แล้วเปิดลิงก์ดูบันทึกที่ทำเสร็จ",
        "Ask ChordJai to save an update in our LINE Official Account. If details are missing, your assistant asks a follow-up question. Choose an answer or type your own, then open the link to the finished entry.",
      ),
      points: [
        t(
          "สั่งบันทึกได้โดยไม่ต้องเปิดฟอร์มก่อน",
          "Ask to save an update without opening a form first",
        ),
        t(
          "ถามเพิ่มทีละเรื่องเมื่อข้อมูลยังไม่พอ",
          "Follow-up questions when more information is needed",
        ),
        t(
          "เปิดผลลัพธ์ผ่าน LIFF แล้วกลับมาแก้ไขได้",
          "Open the result through LIFF and edit it later",
        ),
      ],
      note: t(
        "เลือกเปิดการติดตามเรื่องที่ยังต่อเนื่องผ่าน LINE ทุก 5 หรือ 7 วัน และพักหรือปิดได้เสมอ",
        "You can opt in to LINE check-ins every 5 or 7 days, and pause or turn them off whenever you like.",
      ),
      link: t("เปิดผู้ช่วยชิดใจ", "Open your assistant"),
      href: "/app?tab=chat",
    },
    {
      id: "passport" as const,
      number: "03",
      kicker: t(
        "Pet Passport · เตรียมพบคุณหมอ",
        "Pet Passport · Ready for the vet",
      ),
      title: t("เรื่องที่หมอควรรู้", "The things your vet should know."),
      continuation: t(
        "ค่อย ๆ เตรียมไปด้วยกัน",
        "Put the story together, step by step.",
      ),
      text: t(
        "เริ่มจากเรื่องที่คุณสังเกต ชิดใจจะถามต่อจากคำตอบ และช่วยถามให้ง่ายขึ้นเมื่อยังตอบไม่ได้ รวมคำตอบ ประวัติ และรูปที่เกี่ยวข้อง ให้คุณตรวจและยืนยันก่อนแชร์กับคุณหมอ",
        "Start with what you have noticed. ChordJai asks questions based on your answers and helps rephrase when you are unsure. Bring your answers, history and relevant photos together, then review and confirm before sharing with your vet.",
      ),
      points: [
        t(
          "คุณตรวจคำตอบและรูปก่อนแชร์",
          "Review your answers and photos before sharing",
        ),
        t(
          "หมออ่านสรุป ย้อนดูคำตอบและรูปได้",
          "Your vet can read the summary, answers and photos",
        ),
        t(
          "เก็บผลหลังพบหมอกลับเข้าไดอารี่",
          "Save the visit outcome back to the care diary",
        ),
      ],
      note: t(
        "เริ่มเตรียม Pet Passport ได้จากสมุดสุขภาพของน้อง",
        "Start preparing a Pet Passport from your pet’s health journal.",
      ),
      link: t("เตรียมข้อมูลก่อนพบหมอ", "Prepare for a vet visit"),
      href: "/app?tab=health",
    },
    {
      id: "memories" as const,
      number: "04",
      kicker: t("สมุดความทรงจำของเรา", "Your memory book"),
      title: t("วันธรรมดาของน้อง", "Their ordinary little days."),
      continuation: t("ก็น่าเก็บไว้เหมือนกัน", "Worth a page of their own."),
      text: t(
        "สร้างสมุดของคุณกับน้อง แต่งหน้าปก แล้วเก็บเรื่องราวทีละหน้า ใส่รูป ข้อความ วันที่ และสถานที่ อ่านย้อนกลับมาเมื่อไรก็ได้ และกลับมาแก้หน้าที่ชอบได้เสมอ",
        "Make a book for you and your pet. Decorate the cover and keep one story on each page, with photos, words, dates and places. Read it again whenever you like and return to edit any page.",
      ),
      points: [
        t(
          "เพิ่มหน้า อ่านทีละหน้า และแก้ไขย้อนหลังได้",
          "Add pages, read them one by one and edit them later",
        ),
        t(
          "ลากวาง ย้าย และย่อขยายองค์ประกอบเอง",
          "Drag, move and resize the elements yourself",
        ),
        t(
          "บอก AI ให้ช่วยจัดหน้า แล้วเลือกแบบที่ชอบ",
          "Ask AI to help with a layout, then choose what you like",
        ),
      ],
      note: t(
        "บางวันอาจมีแค่รูปเดียวกับประโยคสั้น ๆ ก็เป็นหน้าที่มีความหมายแล้ว",
        "Some days, one photo and a few words are all a meaningful page needs.",
      ),
      link: t("เปิดสมุดความทรงจำ", "Open your memory book"),
      href: "/app?tab=journal",
    },
    {
      id: "petid" as const,
      number: "05",
      kicker: t(
        "PetID · รู้จักน้องให้มากขึ้น",
        "PetID · A little more about them",
      ),
      title: t("ใบหน้าที่จำได้", "A face you know by heart."),
      continuation: t(
        "กับรายละเอียดที่เป็นของน้อง",
        "The details that make them, them.",
      ),
      text: t(
        "เก็บภาพน้องจากหลายมุมและต่างช่วงเวลา พร้อมจุดสังเกตที่คุณตรวจและแก้ไขได้ เพื่อช่วยค้นหาตัวที่อาจตรงกันจากภาพ แล้วให้เจ้าของตรวจสอบและยืนยัน",
        "Keep photos from different angles and moments, with distinguishing features you can review and edit. Use them to help find possible photo matches for an owner to check and confirm.",
      ),
      points: [
        t(
          "เก็บภาพหลายมุมและตรวจคุณภาพรูปที่เก็บไว้",
          "Keep multiple views and check saved photo quality",
        ),
        t(
          "ตรวจและยืนยันว่าเป็นน้องตัวเดิม",
          "Review and confirm that the photos show the same pet",
        ),
        t(
          "เลือกยินยอมเพื่อวิจัยและฝึกโมเดลแยกต่างหาก",
          "Choose research and training consent separately",
        ),
      ],
      note: t(
        "PetID เป็นตัวช่วยค้นหาตัวที่อาจตรงกัน และยังไม่ใช่การรับรองตัวตนอย่างเป็นทางการ",
        "PetID helps suggest possible matches. It is not certified identity verification.",
      ),
      link: t("เริ่มรู้จัก PetID", "Explore PetID"),
      href: "/app?tab=petid",
    },
  ];
  return (
    <LandingExperience
      pauseLabel={t("พักภาพเคลื่อนไหว", "Pause motion")}
      playLabel={t("เปิดภาพเคลื่อนไหว", "Enable motion")}
    >
      <a className="cj-skip" href="#main-content">
        {t("ข้ามไปเนื้อหา", "Skip to content")}
      </a>
      <LandingNav locale={locale} page="product" />
      <main id="main-content" className="product-main">
        <div id="top" className="product-top-anchor" />
        <section
          id="care-diary"
          className="product-hero"
          aria-labelledby="product-title"
        >
          <div className="cj-wrap product-hero-layout">
            <div className="product-hero-copy" data-reveal>
              <Link className="product-home-link" href={href("/")}>
                <ArrowLeft size={15} aria-hidden="true" />
                {t("กลับหน้าแรก", "Back to home")}
              </Link>
              <span className="cj-eyebrow">
                {t(
                  "01 / ไดอารี่ดูแลน้อง · เริ่มจากวันนี้ของเรา",
                  "01 / Care diary · Start with your today",
                )}
              </span>
              <h1 id="product-title">
                {t("ทุกเรื่องเล็กของน้อง", "Every little update.")}
                <br />
                <span>
                  {t("ค่อย ๆ ต่อกันเป็นเรื่องเดียว", "A story you can follow.")}
                </span>
              </h1>
              <p>
                {t(
                  "อาการวันนี้ คุณหมอบอกอะไร จ่ายไปเท่าไร หรือแค่เรื่องที่อยากเล่า บันทึกไว้ทีละเรื่อง ให้คุณย้อนอ่านและเตรียมดูแลน้องต่อได้จากพื้นที่เดียว",
                  "How they feel today. What the vet said. What it cost. Or something you just want to share. Keep one update at a time, so you can look back and prepare for what comes next.",
                )}
              </p>
              <ul className="product-points">
                <li>
                  <Check size={17} aria-hidden="true" />
                  {t(
                    "ใส่รูปยา หน้าของน้อง หรือใบเสร็จประกอบได้",
                    "Add photos of medicine, your pet or receipts",
                  )}
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {t(
                    "ใส่ค่าใช้จ่ายและวันที่ได้ โดยไม่บังคับ",
                    "Add expenses and their dates when you want to",
                  )}
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {t(
                    "กลับมาแก้ไขหรือลบบันทึกได้",
                    "Return to edit or delete an entry",
                  )}
                </li>
              </ul>
              <div className="product-hero-actions">
                <Link className="cj-button" href={href("/app?tab=health")}>
                  {t("เปิดไดอารี่ดูแลน้อง", "Open the care diary")}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <a className="cj-text-link" href="#product-features">
                  {t(
                    "ดูว่าชิดใจช่วยอะไรได้อีก",
                    "Explore what else you can do",
                  )}
                  <ArrowDown size={17} aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="product-hero-screen" data-reveal>
              <ProductPhone screen="care-diary" locale={locale} />
            </div>
          </div>
        </section>
        <nav
          id="product-features"
          className="product-feature-index cj-wrap"
          aria-label={t("เลือกดูฟีเจอร์", "Explore a feature")}
        >
          {features.map(({ id, label, icon: Icon }, index) => (
            <a key={id} href={`#${id}`}>
              <span className="product-index-number">0{index + 1}</span>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              <ArrowDown size={14} aria-hidden="true" />
            </a>
          ))}
        </nav>
        <div className="product-stories">
          {stories.map(
            (
              {
                id,
                number,
                kicker,
                title,
                continuation,
                text,
                points,
                note,
                link,
                href: target,
              },
              index,
            ) => (
              <section
                key={id}
                id={id}
                className={`product-feature product-feature-${id}${index % 2 === 0 ? " product-feature-reverse" : ""}`}
                aria-labelledby={`product-${id}-title`}
              >
                <div className="cj-wrap product-feature-layout">
                  <div className="product-feature-copy" data-reveal>
                    <span className="cj-eyebrow">
                      {number} / {kicker}
                    </span>
                    <h2 id={`product-${id}-title`}>
                      {title}
                      <br />
                      <span>{continuation}</span>
                    </h2>
                    <p>{text}</p>
                    <ul className="product-points">
                      {points.map((point) => (
                        <li key={point}>
                          <Check size={17} aria-hidden="true" />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <Link className="cj-text-link" href={href(target)}>
                      {link}
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </Link>
                    <p className="product-feature-note">{note}</p>
                  </div>
                  <div className="product-feature-screen" data-reveal>
                    <ProductPhone screen={id} locale={locale} />
                  </div>
                </div>
              </section>
            ),
          )}
        </div>
        <section
          className="product-control"
          aria-labelledby="product-control-title"
        >
          <div className="cj-wrap product-control-layout" data-reveal>
            <ShieldCheck size={34} aria-hidden="true" />
            <div>
              <span className="cj-eyebrow">
                {t("พื้นที่ของคุณกับน้อง", "Your pet. Your space.")}
              </span>
              <h2 id="product-control-title">
                {t(
                  "คุณเลือกเองว่าเรื่องไหนจะเก็บไว้ และแชร์ให้ใคร",
                  "You choose what to keep and who to share it with.",
                )}
              </h2>
              <p>
                {t(
                  "ตรวจข้อมูลก่อนแชร์ จัดการบันทึกของคุณ และเลือกความยินยอมเพื่อวิจัยแยกจากการใช้งานทั่วไป",
                  "Review information before sharing, manage your own records, and choose research consent separately from everyday use.",
                )}
              </p>
            </div>
            <Link className="cj-text-link" href={href("/privacy")}>
              {t("อ่านเรื่องความเป็นส่วนตัว", "Read about privacy")}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <section
          className="product-start cj-wrap"
          aria-labelledby="product-start-title"
          data-reveal
        >
          <span className="cj-eyebrow">
            {t("ไม่ต้องรอให้มีเรื่องใหญ่", "Start with a little thing.")}
          </span>
          <h2 id="product-start-title">
            {t("วันนี้ของน้อง เป็นยังไงบ้าง?", "How is your pet doing today?")}
          </h2>
          <p>
            {t(
              "เริ่มจากชื่อน้อง แล้วค่อย ๆ เก็บเรื่องของเราไปด้วยกัน",
              "Start with their name. Keep your story, one day at a time.",
            )}
          </p>
          <Link href={href("/app")} className="cj-button">
            {t("เริ่มใช้งานชิดใจผ่าน LINE", "Start ChordJai with LINE")}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="product-footer">
        <div className="cj-wrap">
          <div>
            <Link href={href("/")}>
              chord<span>jai</span>
            </Link>
            <p>
              {t(
                "ทุกเรื่องของน้อง อยู่ใกล้ใจ",
                "Their little life, close to your heart.",
              )}
            </p>
          </div>
          <nav aria-label={t("ข้อมูลบริการ", "Service information")}>
            <Link href={href("/")}>{t("หน้าแรก", "Home")}</Link>
            <Link href={href("/privacy")}>
              {t("ความเป็นส่วนตัว", "Privacy")}
            </Link>
            <Link href={href("/terms")}>
              {t("เงื่อนไขบริการ", "Terms of service")}
            </Link>
            <Link href={href("/emergency")}>
              {t("ข้อมูลฉุกเฉิน", "Emergency help")}
            </Link>
          </nav>
          <a
            href="#top"
            className="product-back-top"
            aria-label={t("กลับด้านบน", "Back to top")}
          >
            <ArrowUp size={20} />
          </a>
          <small>
            {t(
              "AI ช่วยจัดข้อมูล ไม่แทนการวินิจฉัยจากสัตวแพทย์",
              "AI helps organise information. It does not replace a veterinarian’s diagnosis.",
            )}
          </small>
        </div>
      </footer>
    </LandingExperience>
  );
}
