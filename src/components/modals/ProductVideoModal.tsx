import React, { useEffect, useRef, useState } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { Product } from '../../types';
import { useI18n } from '../../i18n';
import { getWhatsAppInquiryUrl, hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  MessageCircle,
  Sparkles,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

interface ProductVideoModalProps {
  product: Product | null;
  onClose: () => void;
  onInquire?: (product: Product) => void;
}

export const ProductVideoModal: React.FC<ProductVideoModalProps> = ({
  product,
  onClose,
  onInquire
}) => {
  const { d, lang } = useI18n();
  useSiteContactConfig();
  const waConfigured = hasConfiguredWhatsApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useDialog(!!product, onClose);

  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === ' ' && videoRef.current && !target?.closest('button, a, input, textarea, select')) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product]);

  if (!product || !product.videoUrl) return null;

  const name = (d.productsData as Record<string, string>)[product.nameKey] || product.model;
  const desc = (d.productsData as Record<string, string>)[product.descKey] || '';
  const spec = (d.productsData as Record<string, string>)[product.specKey] || product.specKey;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 1;
    setCurrentTime(curr);
    setDuration(dur);
    setProgress((curr / dur) * 100);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const targetTime = (parseFloat(e.target.value) / 100) * (videoRef.current.duration || 1);
    videoRef.current.currentTime = targetTime;
    setProgress(parseFloat(e.target.value));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-4xl bg-[#0c1015] rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex flex-col"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-sky animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white truncate">{name}</h3>
                <span className="font-sign text-[11px] text-sky px-2 py-0.5 rounded-full bg-sky/15 shrink-0">
                  {product.model}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                现场施工工况实录 · 官方高清工程技术演示
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="关闭视频"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video Player Canvas */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center group overflow-hidden">
          <video
            ref={videoRef}
            src={product.videoUrl}
            autoPlay
            playsInline
            onLoadedData={() => setIsLoading(false)}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer"
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs">
              <div className="w-10 h-10 border-2 border-sky border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Big Center Play/Pause button on pause */}
          {!isPlaying && !isLoading && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-sky/90 text-night flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            >
              <Play className="w-8 h-8 ml-1 fill-current" />
            </button>
          )}

          {/* Floating Controls Bar */}
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-90 group-hover:opacity-100 transition-opacity">
            {/* Progress Slider */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onChange={handleSeek}
              className="w-full h-1.5 bg-white/20 accent-sky rounded-lg appearance-none cursor-pointer mb-3"
            />

            <div className="flex items-center justify-between text-xs text-white">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-1 hover:text-sky transition-colors"
                  title={isPlaying ? '暂停' : '播放'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button
                  onClick={toggleMute}
                  className="p-1 hover:text-sky transition-colors"
                  title={isMuted ? '取消静音' : '静音'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <span className="font-sign text-[11px] text-slate-300">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  已通过原厂工艺检验认证
                </span>

                <button
                  onClick={toggleFullscreen}
                  className="p-1 hover:text-sky transition-colors"
                  title="全屏"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Metadata & Fast Conversion Actions */}
        <div className="p-5 sm:p-6 bg-[#11161d] border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">{name}</span>
              <span className="text-xs font-sign font-bold text-sky">
                官方标价: {product.price}
              </span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1">
              核心规格: {spec} · 适用全国各等级公路路面裂缝修补与预防性养护
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {waConfigured && (
              <a
                href={getWhatsAppInquiryUrl(name, product.model, lang)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm hover:scale-[1.02]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp 直询展示</span>
              </a>
            )}

            {onInquire && (
              <button
                onClick={() => {
                  onClose();
                  onInquire(product);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold bg-sky text-night hover:bg-sky-hover transition-all shadow-sm hover:scale-[1.02]"
              >
                <Sparkles className="w-4 h-4" />
                <span>立即索取报价单</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
