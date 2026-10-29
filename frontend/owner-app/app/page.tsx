import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  Fingerprint,
  Heart,
  LockKeyhole,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
} from "lucide-react";
import { localizedHref } from "../../shared/locale-core";
import { getTranslator } from "../../shared/locale-server";
import {
  CareStories,
  LandingExperience,
  LandingMedia,
  LandingNav,
} from "../components/landing-interactions";
import { landingMedia } from "../components/landing-media";
import "./landing.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: t(
      "ชิดใจ · ทุกเรื่องของน้อง อยู่ใกล้ใจ",
      "ChordJai · Their little life, close to your heart",
    ),
    description: t(
      "เล่าเรื่องน้องผ่าน LINE เก็บอาการ นัดหมาย ค่ารักษา และความทรงจำ เตรียมพบหมอด้วย Pet Passport และเริ่มรู้จัก PetID",
      "Tell ChordJai about your pet on LINE. Keep symptoms, vet visits, expenses and memories together, prepare a Pet Passport, and explore PetID.",
    ),
  };
}

export default async function Landing() {
  const { locale, t } = await getTranslator();
  const href = (path: string) => localizedHref(path, locale);
  const stories = [
    {
      id: "diary",
      title: t("บันทึกเรื่องของน้อง", "Keep their story"),
      text: t(
        "เมื่อวานเป็นยังไง วันนี้ดีขึ้นไหม",
        "How were they yesterday? How about today?",
      ),
      detail: t(
        "อาการเล็ก ๆ รูปยา ใบเสร็จ หรือเรื่องที่อยากเล่า เก็บรวมไว้ในไดอารี่ ใส่ค่าใช้จ่ายและวันที่ได้ตามสะดวก แล้วกลับมาดูสิ่งที่เปลี่ยนไปได้เสมอ",
        "Little symptoms, medicine photos, receipts, or something you need to get off your chest. Keep them in a care diary, with optional expenses and dates, and look back at what has changed.",
      ),
      link: t("เปิดไดอารี่ดูแลน้อง", "Open the care diary"),
      href: "/app?tab=health",
      media: landingMedia["story-diary"],
      mediaLabel: t(
        "ช่วงเวลาดูแลสัตว์เลี้ยงและเก็บเรื่องราวที่บ้าน",
        "Everyday pet care and memories at home",
      ),
    },
    {
      id: "passport",
      title: t("เตรียมไปพบคุณหมอ", "Get ready for the vet"),
      text: t(
        "เรื่องที่อยากบอกหมอ เตรียมให้ครบก่อนออกจากบ้าน",
        "The things your vet should know. Ready before you go.",
      ),
      detail: t(
        "Pet Passport ช่วยถามทีละเรื่องจากคำตอบของคุณ รวมอาการ ประวัติ และรูปที่เกี่ยวข้อง คุณตรวจและยืนยันก่อนแชร์ ให้หมออ่านสรุปและดูคำตอบได้ แล้วเก็บผลหลังพบหมอกลับเข้าไดอารี่",
        "Pet Passport asks follow-up questions based on your answers, bringing together symptoms, history and photos. Review and confirm before sharing, so your vet can read the summary and answers. Save the visit outcome back to your diary.",
      ),
      link: t("เตรียมข้อมูลในสมุดสุขภาพ", "Prepare in the health journal"),
      href: "/app?tab=health",
      media: landingMedia["story-passport"],
      mediaLabel: t(
        "เจ้าของเตรียมข้อมูลก่อนพาสัตว์เลี้ยงพบสัตวแพทย์",
        "An owner preparing for a vet visit",
      ),
    },
    {
      id: "followup",
      title: t("ดูแลเรื่องที่ยังต่อเนื่อง", "Keep caring, together"),
      text: t(
        "“วันนี้น้องเป็นยังไงบ้าง” ในวันที่คุณอยากให้เราช่วยจำ",
        "“How are they doing?” When a little check-in helps.",
      ),
      detail: t(
        "เลือกเปิดการติดตามผ่าน LINE ทุก 5 หรือ 7 วัน ตามเรื่องที่คุณยินยอมให้ใช้ เลือกความถี่ พัก หรือปิดได้เสมอ เพื่อกลับมาเล่าอาการหลังรักษาและเรื่องที่อยากดูแลต่อ",
        "Opt in to LINE check-ins every 5 or 7 days, using only the information you allow. Choose the frequency, pause, or switch them off whenever you like, and keep track of recovery and ongoing care.",
      ),
      link: t("รู้จักผู้ช่วยของเรา", "Meet your assistant"),
      href: "/app?tab=chat",
      media: landingMedia["story-followup"],
      mediaLabel: t(
        "สัตว์เลี้ยงพักผ่อนใกล้เจ้าของในบ้าน",
        "A quiet moment at home with a pet",
      ),
    },
  ];
  const questions = [
    {
      q: t(
        "เริ่มใช้งานยังไง ต้องโหลดแอปไหม",
        "How do I start? Do I need another app?",
      ),
      a: t(
        "เปิดชิดใจ เข้าสู่ระบบด้วย LINE แล้วเพิ่มน้องของคุณ ใช้ผ่านเว็บหรือ LIFF ใน LINE ได้ เมื่อต้องการบันทึกผ่านแชต ให้ส่งข้อความขอให้ชิดใจบันทึกใน LINE OA ของเรา",
        "Open ChordJai, sign in with LINE, and add your pet. Use the website or LIFF inside LINE. To save through chat, explicitly ask ChordJai to record an update in our LINE Official Account.",
      ),
    },
    {
      q: t(
        "แก้หรือลบเรื่องที่บันทึกไปแล้วได้ไหม",
        "Can I edit or delete a saved record?",
      ),
      a: t(
        "ได้ คุณกลับไปแก้หรือลบบันทึกสุขภาพ ไดอารี่ และหน้าความทรงจำได้ เลือกเก็บเฉพาะเรื่องที่ต้องการ และตรวจข้อมูลก่อนแชร์ให้ผู้อื่นเสมอ",
        "Yes. You can edit or delete health records, care diary entries and memory pages. Keep what matters to you, and review your information before sharing it.",
      ),
    },
    {
      q: t(
        "รูปของน้องจะถูกนำไปฝึกโมเดลเลยหรือเปล่า",
        "Are my pet’s photos automatically used to train a model?",
      ),
      a: t(
        "ไม่ การใช้ข้อมูลเพื่อวิจัยและฝึกโมเดล PetID ต้องได้รับความยินยอมแยกต่างหาก คุณใช้ฟีเจอร์ดูแลน้องได้โดยไม่ต้องยินยอม และจัดการหรือถอนความยินยอมได้",
        "No. PetID research and model training require separate consent. You can use the care features without agreeing to research, and you can manage or withdraw that consent.",
      ),
    },
    {
      q: t(
        "PetID ยืนยันตัวน้องได้แม่นยำแค่ไหน",
        "How reliable is PetID identification?",
      ),
      a: t(
        "ขณะนี้ PetID ใช้ภาพและจุดสังเกตช่วยค้นหาตัวที่อาจตรงกัน ให้เจ้าของตรวจสอบและยืนยัน เรายังไม่อ้างความแม่นยำหรือการรับรองตัวตนอย่างเป็นทางการ การประเมินต้องอาศัยข้อมูลทดสอบจริงต่อไป",
        "PetID currently uses photos and distinguishing features to suggest possible matches for an owner to review and confirm. We do not claim a measured accuracy rate or certified identity verification. Those require further evaluation on real test data.",
      ),
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
      <LandingNav locale={locale} />
      <main id="main-content">
        <section className="cj-hero" id="top" aria-labelledby="hero-title">
          <div className="cj-wrap cj-hero-layout">
            <div className="cj-hero-copy">
              <span className="cj-eyebrow">
                {t(
                  "ชิดใจ · พื้นที่ของคุณกับน้อง",
                  "ChordJai · A space for you and your pet",
                )}
              </span>
              <h1 id="hero-title">
                {t("ทุกวันของน้อง", "Their little life.")}
                <br />
                <span>{t("มีเราอยู่ใกล้ ๆ", "A little closer.")}</span>
              </h1>
              <p>
                {t(
                  "ทั้งวันที่ซน วันที่ป่วย และวันที่แค่นอนข้างกัน",
                  "The playful days. The worrying days. The just-being-together days.",
                )}
                <br />
                {t(
                  "เล่าให้ชิดใจฟัง แล้วเก็บไว้ดูแลกันต่อ",
                  "Tell ChordJai, and keep caring from there.",
                )}
              </p>
              <div className="cj-hero-actions">
                <Link className="cj-button" href={href("/app")}>
                  {t("เริ่มพื้นที่ของเรากับน้อง", "Start your little space")}
                  <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <Link className="cj-text-link" href={href("/product")}>
                  {t("ชิดใจช่วยอะไรได้บ้าง", "Meet ChordJai")}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              </div>
              <span className="cj-hero-note">
                <MessageCircle size={16} aria-hidden="true" />
                {t(
                  "เริ่มได้ผ่าน LINE ที่คุณใช้อยู่ทุกวัน",
                  "Start with LINE. Already part of your day.",
                )}
              </span>
            </div>
            <div className="cj-hero-scene">
              <LandingMedia
                hero
                source={landingMedia.hero}
                label={t(
                  "แมวสีส้มกับสุนัขสีครีมนั่งข้างกันบนโซฟา",
                  "An orange cat and a cream dog sitting together on a sofa",
                )}
                className="cj-hero-media"
                fallback={
                  <Image
                    className="cj-hero-logo"
                    src="/brand/chordjai-logo.png"
                    alt={t(
                      "โลโก้ชิดใจ รูปสุนัขและแมว",
                      "ChordJai dog and cat logo",
                    )}
                    width={1254}
                    height={1254}
                    sizes="(max-width: 680px) 85vw, 43vw"
                    fetchPriority="high"
                    loading="eager"
                  />
                }
              />
              <div className="cj-scene-caption">
                <span>
                  {t(
                    "เล่า เก็บ ดูแล แล้วเติบโตไปด้วยกัน",
                    "Little stories. A lifetime together.",
                  )}
                </span>
                <Heart size={19} aria-hidden="true" />
              </div>
            </div>
          </div>
          <div className="cj-wrap cj-hero-bottom">
            <span>
              01 /{" "}
              {t(
                "เริ่มจากเรื่องเล็ก ๆ ของน้อง",
                "Start with the little things",
              )}
            </span>
            <a
              href="#everyday"
              aria-label={t("เลื่อนดูเรื่องราว", "Explore the story")}
            >
              <ArrowDown size={20} />
            </a>
            <span>
              {t("ใกล้ใจ ในทุกวัน", "Close to your heart, every day.")}
            </span>
          </div>
        </section>
        <div className="cj-promise-strip">
          <div className="cj-wrap">
            <span>
              <NotebookPen size={18} aria-hidden="true" />
              {t("เล่าผ่าน LINE ได้", "Tell us on LINE")}
            </span>
            <span>
              <Heart size={18} aria-hidden="true" />
              {t("สุขภาพและความทรงจำ", "Care and memories")}
            </span>
            <span>
              <LockKeyhole size={18} aria-hidden="true" />
              {t("คุณเลือกสิ่งที่จะแชร์", "Your choice to share")}
            </span>
          </div>
        </div>
        <section
          className="cj-section cj-wrap"
          id="everyday"
          aria-labelledby="everyday-title"
        >
          <div className="cj-section-heading" data-reveal>
            <span className="cj-eyebrow">
              {t(
                "เรื่องเล็ก ๆ วันนี้ สำคัญกับวันข้างหน้า",
                "Little things today. A clearer tomorrow.",
              )}
            </span>
            <h2 id="everyday-title">
              {t("ไม่ต้องจำทุกอย่าง", "You don’t have to")}
              <br />
              <span>{t("ไว้คนเดียวแล้ว", "remember it all alone.")}</span>
            </h2>
            <p>
              {t(
                "จากอาการเมื่อวาน ถึงนัดหมายครั้งหน้า",
                "From yesterday’s symptoms to the next appointment.",
              )}
              <br />
              {t(
                "เรื่องของน้องค่อย ๆ ต่อกันเป็นเรื่องเดียว",
                "Their story starts coming together.",
              )}
            </p>
          </div>
          <div data-reveal>
            <CareStories
              stories={stories}
              label={t("เรื่องที่ชิดใจช่วยดูแล", "Ways ChordJai helps")}
              previous={t("เรื่องก่อนหน้า", "Previous story")}
              next={t("เรื่องถัดไป", "Next story")}
              locale={locale}
            />
          </div>
        </section>
        <section className="cj-line-section" aria-labelledby="line-title">
          <div className="cj-wrap cj-line-layout">
            <div data-reveal>
              <span className="cj-eyebrow">
                {t(
                  "คุยง่าย เหมือนเล่าให้คนใกล้ตัวฟัง",
                  "As easy as telling someone close.",
                )}
              </span>
              <h2 id="line-title">
                {t("พิมพ์เรื่องของน้อง", "Just tell their story.")}
                <br />
                <span>
                  {t("เดี๋ยวชิดใจช่วยเก็บ", "We’ll help you keep it.")}
                </span>
              </h2>
              <p>
                {t(
                  "บอกให้บันทึกผ่านแชต ผู้ช่วยจะถามข้อมูลที่ยังขาด แล้วส่งลิงก์ให้เปิดดูงานที่ทำเสร็จ คุณกลับไปแก้ไขหรือลบได้เสมอ",
                  "Ask to save an update in chat. Your assistant asks for any missing details, then sends a link to the finished entry. You can edit or delete it later.",
                )}
              </p>
              <Link href={href("/app?tab=chat")} className="cj-text-link">
                {t("เปิดผู้ช่วยชิดใจ", "Meet your ChordJai assistant")}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <div
              className="cj-conversation"
              data-reveal
              aria-label={t(
                "ตัวอย่างบทสนทนา ไม่ใช่ประวัติจริง",
                "Illustrative conversation, not a real record",
              )}
            >
              <span className="cj-demo-label">
                {t("ตัวอย่างการคุยกับชิดใจ", "An example conversation")}
              </span>
              <div className="cj-chat-owner">
                {t(
                  "วันนี้พาน้องไปหาหมอมา ช่วยบันทึกให้หน่อย",
                  "We went to the vet today. Can you save an update?",
                )}
              </div>
              <div className="cj-chat-assistant">
                <span className="cj-chat-name">chordjai</span>
                {t(
                  "ได้เลยค่ะ วันนี้น้องเป็นอะไร แล้วคุณหมอบอกว่ายังไงบ้างคะ?",
                  "Of course. What was bothering them, and what did the vet tell you?",
                )}
              </div>
              <div className="cj-chat-owner">
                {t(
                  "คันหูน้อยลงแล้ว หมอนัดดูอาการอาทิตย์หน้า",
                  "Their ears are less itchy. We’re going back next week.",
                )}
              </div>
              <div className="cj-chat-result">
                <Check size={19} aria-hidden="true" />
                <div>
                  <strong>
                    {t(
                      "เรื่องของน้อง มีที่เก็บแล้ว",
                      "Their update has a home.",
                    )}
                  </strong>
                  <span>
                    {t(
                      "เปิดจากลิงก์ใน LINE แล้วดูแลต่อได้เลย",
                      "Open the link in LINE and keep caring.",
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          className="cj-section cj-wrap cj-overview"
          aria-labelledby="overview-title"
        >
          <div className="cj-overview-heading" data-reveal>
            <div>
              <span className="cj-eyebrow">
                {t(
                  "เรื่องเดียวกัน อยู่ในที่เดียวกัน",
                  "Their care, connected.",
                )}
              </span>
              <h2 id="overview-title">
                {t("ค่อย ๆ รู้จักน้อง", "Know them a little better.")}
                <br />
                {t("มากขึ้นในทุกวัน", "Every single day.")}
              </h2>
            </div>
            <p>
              {t(
                "ไดอารี่ สมุดสุขภาพ รูป และเรื่องสำคัญที่คุณเลือกเก็บ เปิดย้อนอ่านหรือเตรียมข้อมูลก่อนพบหมอได้จากพื้นที่เดียว",
                "Your diary, health journal, photos and the things you choose to keep. Look back or prepare for the vet, all from one space.",
              )}
            </p>
          </div>
          <figure className="cj-app-preview" data-reveal>
            <Image
              src={
                locale === "en"
                  ? "/images/chordjai-overview-en.webp"
                  : "/images/chordjai-overview-th.webp"
              }
              alt={t(
                "หน้าจอจริงของชิดใจในโหมดตัวอย่าง",
                "A real ChordJai screen in sample mode",
              )}
              width={1440}
              height={1100}
              sizes="(max-width: 680px) 100vw, 1200px"
            />
            <figcaption>
              {t(
                "หน้าจอของชิดใจ · ข้อมูลตัวอย่าง",
                "A ChordJai screen · sample data",
              )}
              <Link href={href("/product")}>
                {t("ดูการใช้งานจริง", "See the product")}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </figcaption>
          </figure>
        </section>
        <section
          className="cj-petid-section"
          id="petid"
          aria-labelledby="petid-title"
        >
          <div className="cj-wrap cj-petid-layout">
            <div className="cj-petid-visual" data-reveal>
              <LandingMedia
                source={landingMedia.petid}
                label={t(
                  "แมวสีส้มพร้อมภาพเทียบหลายมุมและกราฟิกจุดสังเกต",
                  "An orange cat with multi-angle reference images and feature-tracking graphics",
                )}
                className="cj-petid-media"
              />
              <div className="cj-petid-signature">
                <Fingerprint size={21} aria-hidden="true" />
                <span>
                  PetID{" "}
                  <small>
                    {t(
                      "เพราะน้องมีตัวเดียวในโลกของคุณ",
                      "One of a kind. Always yours.",
                    )}
                  </small>
                </span>
              </div>
            </div>
            <div className="cj-petid-copy" data-reveal>
              <span className="cj-eyebrow">
                {t("ทำความรู้จัก PetID", "Meet PetID")}
              </span>
              <h2 id="petid-title">
                {t("ใบหน้าที่คุ้นเคย", "A familiar face.")}
                <br />
                <span>
                  {t("เรื่องราวที่เป็นของน้อง", "A story all their own.")}
                </span>
              </h2>
              <p>
                {t(
                  "เก็บภาพหลายมุมและต่างช่วงเวลา พร้อมจุดสังเกตของน้อง เพื่อช่วยค้นหาตัวที่อาจตรงกัน แล้วให้เจ้าของตรวจสอบและยืนยัน",
                  "Build a collection of photos from different angles and moments, with distinguishing features, to help find possible matches for an owner to review and confirm.",
                )}
              </p>
              <ul>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {t(
                    "ตรวจคุณภาพรูปที่เก็บไว้",
                    "Check the quality of saved photos",
                  )}
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {t(
                    "ภาพและจุดสังเกตช่วยค้นหาตัวที่คล้ายกัน",
                    "Photos and features help find possible matches",
                  )}
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {t(
                    "การฝึกโมเดลต้องยินยอมแยกเสมอ",
                    "Separate consent for model training",
                  )}
                </li>
              </ul>
              <Link
                href={href("/app?tab=petid")}
                className="cj-button cj-button-white"
              >
                {t("เริ่มรู้จัก PetID", "Explore PetID")}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <p className="cj-petid-note">
                {t(
                  "PetID อยู่ระหว่างพัฒนาและประเมินผล ไม่ใช่การรับรองตัวตนอย่างเป็นทางการ",
                  "PetID is being developed and evaluated. It is not certified identity verification.",
                )}
              </p>
            </div>
          </div>
        </section>
        <section
          className="cj-section cj-wrap cj-memory-layout"
          id="memories"
          aria-labelledby="memories-title"
        >
          <div className="cj-memory-copy" data-reveal>
            <span className="cj-eyebrow">
              {t("น้องไม่ได้มีแค่ประวัติสุขภาพ", "More than a health history.")}
            </span>
            <h2 id="memories-title">
              {t("บางวันไม่มีอะไร", "Some days, nothing happens.")}
              <br />
              <span>
                {t("แค่มีน้อง ก็พิเศษแล้ว", "Except having them here.")}
              </span>
            </h2>
            <p>
              {t(
                "สร้างสมุดความทรงจำของคุณกับน้อง แต่งหน้าปก เพิ่มหน้า ใส่รูป ข้อความ วันที่ และสถานที่ ลากวางในแบบของคุณ หรือพิมพ์บอกให้ AI ช่วยจัดหน้า แล้วค่อยเลือกบันทึก",
                "Make a memory book for the two of you. Decorate the cover, add pages, photos, words, dates and places. Arrange it your way, or ask AI to help with a layout, then choose what to save.",
              )}
            </p>
            <Link className="cj-text-link" href={href("/app?tab=journal")}>
              {t("เปิดสมุดความทรงจำของเรา", "Open your memory book")}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <figure className="cj-memory-figure" data-reveal>
            <LandingMedia
              source={landingMedia.memories}
              label={t(
                "เจ้าของลูบหัวแมวที่นั่งอยู่ข้างกันบนโซฟา",
                "An owner gently petting their cat on a sofa",
              )}
            />
            <figcaption>
              {t(
                "วันธรรมดา ที่อยากเก็บไว้นาน ๆ",
                "An ordinary day. One to keep.",
              )}
            </figcaption>
          </figure>
        </section>
        <section className="cj-privacy-section">
          <div className="cj-wrap cj-privacy-layout" data-reveal>
            <ShieldCheck size={34} aria-hidden="true" />
            <div>
              <span className="cj-eyebrow">
                {t(
                  "ความไว้ใจ เริ่มจากการให้คุณเลือก",
                  "Trust starts with your choice.",
                )}
              </span>
              <h2>
                {t(
                  "เรื่องของคุณกับน้อง คุณเป็นคนตัดสินใจ",
                  "Your pet. Your story. Your choice.",
                )}
              </h2>
              <p>
                {t(
                  "ตรวจข้อมูลก่อนแชร์ แก้ไขหรือลบสิ่งที่เก็บไว้ และเลือกความยินยอมเพื่อวิจัยแยกจากการใช้งานทั่วไป",
                  "Review before sharing, edit or delete what you keep, and choose research consent separately from everyday use.",
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
          className="cj-section cj-wrap cj-faq"
          id="questions"
          aria-labelledby="questions-title"
        >
          <div data-reveal>
            <span className="cj-eyebrow">
              {t(
                "ก่อนเริ่มพื้นที่ของเรา",
                "Before you make yourselves at home.",
              )}
            </span>
            <h2 id="questions-title">
              {t("เรื่องที่คุณอาจอยากรู้", "A few good things to know.")}
            </h2>
          </div>
          <div className="cj-faq-list" data-reveal>
            {questions.map(({ q, a }) => (
              <details key={q}>
                <summary>
                  {q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="cj-closing" aria-labelledby="closing-title">
          <div className="cj-wrap">
            <div className="cj-closing-copy" data-reveal>
              <span className="cj-eyebrow">
                {t("เริ่มจากวันนี้ของน้อง", "Start with their today.")}
              </span>
              <h2 id="closing-title">
                {t("วันดี ๆ ก็เก็บไว้", "Keep the good days.")}
                <br />
                {t(
                  "วันที่กังวล ก็ค่อย ๆ ดูแลกัน",
                  "Care through the hard ones.",
                )}
              </h2>
              <p>
                {t(
                  "พื้นที่เล็ก ๆ ที่เก็บเรื่องใหญ่ของคนรักสัตว์",
                  "A little space for the biggest part of your life.",
                )}
              </p>
              <Link className="cj-button" href={href("/app")}>
                {t("เริ่มใช้งานชิดใจผ่าน LINE", "Start ChordJai with LINE")}
                <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
            </div>
            <LandingMedia
              source={landingMedia.closing}
              label={t(
                "เจ้าของอยู่กับแมวและสุนัขในห้องนั่งเล่นที่สว่าง",
                "An owner with a cat and dog in a bright living room",
              )}
              className="cj-closing-media"
            />
          </div>
        </section>
      </main>
      <footer className="cj-footer">
        <div className="cj-wrap">
          <div className="cj-footer-top">
            <div>
              <a
                className="cj-footer-logo"
                href="#top"
                aria-label={t("ชิดใจ หน้าหลัก", "ChordJai home")}
              >
                <Image
                  src="/brand/chordjai-logo.png"
                  alt="ChordJai"
                  width={1254}
                  height={1254}
                  sizes="168px"
                  loading="eager"
                />
              </a>
              <p>
                {t(
                  "ทุกเรื่องของน้อง อยู่ใกล้ใจ",
                  "Their little life, close to your heart.",
                )}
              </p>
            </div>
            <nav aria-label={t("ฟีเจอร์ของชิดใจ", "Explore ChordJai")}>
              <span>{t("พื้นที่ของเรากับน้อง", "Your little space")}</span>
              <Link href={href("/app?tab=health")}>
                {t("ไดอารี่และสมุดสุขภาพ", "Care diary and health journal")}
              </Link>
              <Link href={href("/app?tab=journal")}>
                {t("สมุดความทรงจำ", "Memory book")}
              </Link>
              <Link href={href("/app?tab=chat")}>
                {t("ผู้ช่วยชิดใจ", "ChordJai assistant")}
              </Link>
              <Link href={href("/app?tab=petid")}>PetID</Link>
            </nav>
            <nav aria-label={t("ข้อมูลบริการ", "Service information")}>
              <span>{t("รู้จักกันให้มากขึ้น", "A little more about us")}</span>
              <Link href={href("/privacy")}>
                {t("ความเป็นส่วนตัว", "Privacy")}
              </Link>
              <Link href={href("/terms")}>
                {t("เงื่อนไขบริการ", "Terms of service")}
              </Link>
              <Link href={href("/ai-safety")}>
                {t("การใช้ AI", "Using AI")}
              </Link>
              <Link href={href("/emergency")}>
                {t("ข้อมูลฉุกเฉิน", "Emergency help")}
              </Link>
            </nav>
            <a
              className="cj-back-top"
              href="#top"
              aria-label={t("กลับด้านบน", "Back to top")}
            >
              <ArrowUp size={21} />
            </a>
          </div>
          <div className="cj-footer-bottom">
            <span>© {new Date().getFullYear()} ChordJai</span>
            <span>
              {t(
                "AI ช่วยจัดข้อมูลและดูแลเรื่องที่ต้องจำ ไม่แทนการวินิจฉัยจากสัตวแพทย์",
                "AI helps organise information. It does not replace a veterinarian’s diagnosis.",
              )}
            </span>
          </div>
        </div>
      </footer>
    </LandingExperience>
  );
}
