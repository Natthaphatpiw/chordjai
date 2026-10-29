"use client";

import Image from "next/image";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Menu,
  Pause,
  Play,
  X,
} from "lucide-react";
import { LanguageSwitcher } from "../../shared/locale";
import { localizedHref, type Locale } from "../../shared/locale-core";
import type { LandingMediaSource } from "./landing-media";

const MotionContext = createContext(false);

export function LandingExperience({
  children,
  pauseLabel,
  playLabel,
}: {
  children: ReactNode;
  pauseLabel: string;
  playLabel: string;
}) {
  const [motion, setMotion] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setAllowed(!preference.matches);
      let paused = false;
      try {
        paused = localStorage.getItem("chordjai.landing.motion") === "off";
      } catch {
        /* Optional preference. */
      }
      setMotion(!preference.matches && !paused);
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!nodes || !motion || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("cj-visible");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.08 },
    );
    for (const node of nodes) {
      if (node.getBoundingClientRect().top > window.innerHeight)
        node.classList.add("cj-reveal-ready");
      observer.observe(node);
    }
    return () => {
      observer.disconnect();
      nodes.forEach((node) => node.classList.remove("cj-reveal-ready"));
    };
  }, [motion]);
  const toggle = () => {
    const next = !motion;
    setMotion(next);
    try {
      localStorage.setItem("chordjai.landing.motion", next ? "on" : "off");
    } catch {
      /* Optional preference. */
    }
  };
  return (
    <MotionContext.Provider value={motion}>
      <div
        ref={root}
        className="cj-landing"
        data-motion={motion ? "on" : "off"}
      >
        {children}
        {allowed && (
          <button
            className="cj-motion-toggle"
            onClick={toggle}
            aria-label={motion ? pauseLabel : playLabel}
            aria-pressed={!motion}
          >
            {motion ? (
              <Pause size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            <span>{motion ? pauseLabel : playLabel}</span>
          </button>
        )}
      </div>
    </MotionContext.Provider>
  );
}

export function LandingNav({
  locale,
  page = "home",
}: {
  locale: Locale;
  page?: "home" | "product";
}) {
  const [open, setOpen] = useState(false);
  const t = (th: string, en: string) => (locale === "en" ? en : th);
  const menuId = "landing-navigation";
  useEffect(() => {
    setOpen(false);
  }, [locale]);
  return (
    <header className="cj-header">
      <div className="cj-wrap cj-nav">
        <a
          className="cj-brand"
          href={page === "home" ? "#top" : localizedHref("/", locale)}
          aria-label={t("ชิดใจ หน้าหลัก", "ChordJai home")}
          onClick={() => setOpen(false)}
        >
          <span className="cj-brand-emblem">
            <Image
              src="/brand/chordjai-emblem.png"
              alt=""
              width={1254}
              height={1254}
              sizes="72px"
            />
          </span>
          <span>
            chord<span>jai</span>
            <small>
              {t("ทุกเรื่องของน้อง อยู่ใกล้ใจ", "A little closer, every day.")}
            </small>
          </span>
        </a>
        <nav
          id={menuId}
          className={`cj-nav-links${open ? " is-open" : ""}`}
          aria-label={t("เมนูเว็บไซต์", "Website navigation")}
          onClick={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              document.getElementById("landing-menu-button")?.focus();
            }
          }}
        >
          <Link
            href={localizedHref("/product", locale)}
            aria-current={page === "product" ? "page" : undefined}
          >
            {t("รู้จักชิดใจ", "Our product")}
          </Link>
          <a href={page === "home" ? "#everyday" : "#care-diary"}>
            {t("ดูแลกันทุกวัน", "Everyday care")}
          </a>
          <a href="#petid">PetID</a>
          <a href="#memories">{t("ความทรงจำ", "Memories")}</a>
        </nav>
        <div className="cj-nav-actions">
          <LanguageSwitcher />
          <Link
            className="cj-button cj-button-small"
            href={localizedHref("/app", locale)}
          >
            {t("เปิดชิดใจ", "Open app")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <button
            id="landing-menu-button"
            className="cj-menu-button"
            aria-label={
              open ? t("ปิดเมนู", "Close menu") : t("เปิดเมนู", "Open menu")
            }
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(!open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function LandingMedia({
  source,
  label,
  className = "",
  hero = false,
  fallback,
}: {
  source: LandingMediaSource;
  label: string;
  className?: string;
  hero?: boolean;
  fallback?: ReactNode;
}) {
  const motion = useContext(MotionContext);
  const video = useRef<HTMLVideoElement>(null);
  const [mobile, setMobile] = useState(false);
  const [visible, setVisible] = useState(false);
  const [failedVideo, setFailedVideo] = useState(false);
  const [failedImage, setFailedImage] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 680px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { rootMargin: "100px" },
    );
    if (frame.current) observer.observe(frame.current);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", update);
    };
  }, []);
  const poster = mobile ? (source.mobileImage ?? source.image) : source.image;
  const clip = mobile ? (source.mobileVideo ?? source.video) : source.video;
  useEffect(() => {
    setFailedVideo(false);
    setFailedImage(false);
  }, [clip, poster]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (motion && visible && !document.hidden)
      void element.play().catch(() => undefined);
    else element.pause();
    const visibility = () => {
      if (document.hidden) element.pause();
      else if (motion && visible) void element.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      element.pause();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [motion, visible, clip, failedVideo]);
  const showVideo = motion && visible && clip && !failedVideo;
  return (
    <div
      ref={frame}
      className={`cj-media ${className}`}
      data-media-state={poster || clip ? "configured" : "reserved"}
    >
      {poster && !failedImage && (
        <Image
          src={poster}
          alt={label}
          fill
          sizes={
            hero
              ? "(max-width: 680px) 100vw, 55vw"
              : "(max-width: 680px) 100vw, 50vw"
          }
          fetchPriority={hero ? "high" : "auto"}
          loading={hero ? "eager" : "lazy"}
          onError={() => setFailedImage(true)}
        />
      )}
      {showVideo && (
        <video
          ref={video}
          src={clip}
          poster={poster ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={label}
          onError={() => setFailedVideo(true)}
        />
      )}
      {(!poster || failedImage) && !showVideo && (
        <div
          className="cj-media-fallback"
          role={fallback ? undefined : "img"}
          aria-label={fallback ? undefined : label}
        >
          {fallback}
        </div>
      )}
    </div>
  );
}

export type LandingStory = {
  id: string;
  title: string;
  text: string;
  detail: string;
  link: string;
  href: string;
  media: LandingMediaSource;
  mediaLabel: string;
};
export function CareStories({
  stories,
  label,
  previous,
  next,
  locale,
}: {
  stories: LandingStory[];
  label: string;
  previous: string;
  next: string;
  locale: Locale;
}) {
  const [selected, setSelected] = useState(0);
  const story = stories[selected];
  return (
    <div
      className="cj-story-explorer"
      aria-roledescription={locale === "en" ? "carousel" : "ชุดเรื่องราว"}
      aria-label={label}
    >
      <div className="cj-story-tabs" role="tablist" aria-label={label}>
        {stories.map((item, index) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-selected={index === selected}
            aria-controls={`panel-${item.id}`}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              let position = index;
              if (event.key === "ArrowRight")
                position = (index + 1) % stories.length;
              else if (event.key === "ArrowLeft")
                position = (index + stories.length - 1) % stories.length;
              else if (event.key === "Home") position = 0;
              else if (event.key === "End") position = stories.length - 1;
              else return;
              event.preventDefault();
              setSelected(position);
              document.getElementById(`tab-${stories[position].id}`)?.focus();
            }}
          >
            <span>0{index + 1}</span>
            {item.title}
          </button>
        ))}
      </div>
      {stories.map((item, index) => (
        <div
          key={item.id}
          id={`panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${item.id}`}
          hidden={index !== selected}
          tabIndex={0}
        >
          {index === selected && (
            <div className="cj-story-panel">
              <div className="cj-story-visual">
                <LandingMedia
                  source={item.media}
                  label={item.mediaLabel}
                  className={
                    item.id === "followup" ? "cj-media-wide" : undefined
                  }
                />
                <span className="cj-frame-caption">
                  0{index + 1} / {item.title}
                </span>
              </div>
              <div className="cj-story-copy">
                <span className="cj-eyebrow">
                  {locale === "en"
                    ? "A little care, a clearer picture."
                    : "ดูแลทีละเรื่อง เห็นภาพน้องชัดขึ้น"}
                </span>
                <h3>{item.text}</h3>
                <p>{item.detail}</p>
                <Link
                  className="cj-text-link"
                  href={localizedHref(item.href, locale)}
                >
                  {item.link}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="cj-carousel-controls">
        <span aria-live="polite" className="cj-carousel-status">
          0{selected + 1}
          <span>
            {" "}
            / 0{stories.length} · {story.title}
          </span>
        </span>
        <div>
          <button
            onClick={() =>
              setSelected((selected + stories.length - 1) % stories.length)
            }
            aria-label={previous}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            onClick={() => setSelected((selected + 1) % stories.length)}
            aria-label={next}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
