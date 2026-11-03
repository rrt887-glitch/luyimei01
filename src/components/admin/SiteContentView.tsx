import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Building2, ImagePlus, Loader2, Newspaper, Pencil, Plus, QrCode, Save, Trash2, X } from 'lucide-react';
import { EmptyState, FormField, Modal, PageHeader, Panel, Chip } from './AdminUI';
import { FactoryPhoto, NewsPost } from '../../types';
import {
  deleteFactoryPhoto,
  deleteNewsPost,
  mediaUrl,
  newContentId,
  reorderFactoryPhotos,
  saveFactoryPhoto,
  saveNewsPost,
  subscribeAllNews,
  useFactoryPhotos
} from '../../services/siteContent';
import { deleteUploadedMedia, describeUploadError, SiteImageArea, uploadSiteImage } from '../../services/mediaStorage';
import { saveSiteContactConfig, useSiteContactConfig } from '../../config/whatsapp';
import { adminApi } from '../../services/adminApi';

type Lang = 'en' | 'ar' | 'ru';
const LANGS: { key: Lang; label: string; dir?: 'rtl' }[] = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية', dir: 'rtl' },
  { key: 'ru', label: 'Русский' }
];
type Translations<K extends string> = Partial<Record<Lang, Partial<Record<K, string>>>>;

// ---------------------------------------------------------------- picture upload

/**
 * Remembers pictures uploaded while a form is open, so the ones that end up unused
 * (form cancelled, picture replaced) are removed from storage.
 */
function useSessionUploads() {
  const uploaded = useRef<string[]>([]);
  return {
    add: (url: string) => uploaded.current.push(url),
    /** Removes every upload of this session that is not in `keep`, plus `alsoRemove`. */
    cleanup: (keep: (string | undefined)[], alsoRemove: (string | undefined)[] = []) => {
      const keepSet = new Set(keep.filter(Boolean));
      const gone = [...uploaded.current.filter(u => !keepSet.has(u)), ...alsoRemove.filter((u): u is string => !!u && !keepSet.has(u))];
      uploaded.current = [];
      if (gone.length) void deleteUploadedMedia(gone);
    }
  };
}

const ImagePicker: React.FC<{
  area: SiteImageArea;
  value: string;
  onChange: (url: string) => void;
  onUploaded: (url: string) => void;
  aspect?: string;
  label?: string;
}> = ({ area, value, onChange, onUploaded, aspect = 'aspect-[4/3]', label = '上传图片' }) => {
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    setPercent(0);
    try {
      const url = await uploadSiteImage(area, file, p => setPercent(p.percent));
      onUploaded(url);
      onChange(url);
    } catch (err) {
      setError(describeUploadError(err));
    } finally {
      setPercent(null);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div>
      <div className={`relative ${aspect} w-full overflow-hidden rounded-xl border border-dashed border-slate-300 bg-concrete`}>
        {value ? (
          <img src={mediaUrl(value)} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex w-full h-full flex-col items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-night">
            <ImagePlus className="w-6 h-6" />
            {label}
          </button>
        )}
        {percent !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm text-night">
            <Loader2 className="w-5 h-5 animate-spin" />
            上传中 {percent}%
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={percent !== null} className="btn btn-sm btn-outline">
          <ImagePlus className="w-4 h-4" />
          {value ? '更换图片' : label}
        </button>
        {value && (
          <button type="button" onClick={() => onChange('')} className="btn btn-sm btn-ghost text-rose-700">
            <X className="w-4 h-4" />
            移除
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">JPG / PNG，10 MB 以内</p>
      {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => void pick(e.target.files?.[0])} />
    </div>
  );
};

/** English / Arabic / Russian texts of one item. Empty fields show English, then Chinese. */
function TranslationTabs<K extends string>({
  fields,
  value,
  onChange
}: {
  fields: { key: K; label: string; long?: boolean; source: string }[];
  value: Translations<K>;
  onChange: (next: Translations<K>) => void;
}) {
  const [lang, setLang] = useState<Lang>('en');
  const meta = LANGS.find(l => l.key === lang)!;
  const current: Partial<Record<K, string>> = value[lang] || {};
  const shown = fields.filter(f => f.source.trim());
  const filled = (l: Lang) => shown.filter(f => (value[l]?.[f.key] || '').trim()).length;
  return (
    <section className="mt-5">
      <h3 className="mb-1 text-sm font-semibold text-night">外语内容</h3>
      <p className="mb-3 text-[13px] text-slate-500">访客切换语言时显示。阿拉伯文、俄文没填时显示英文，英文也没填就显示中文。</p>
      <div className="segmented mb-3" role="group" aria-label="语言">
        {LANGS.map(l => (
          <button key={l.key} type="button" aria-pressed={lang === l.key} onClick={() => setLang(l.key)}>
            <bdi>{l.label}</bdi>
            <span className="ms-1.5 font-sign text-xs text-slate-400">
              {filled(l.key)}/{shown.length}
            </span>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-slate-500">先填写中文内容。</p>}
      <div className="grid gap-3">
        {shown.map(f => (
          <FormField key={f.key} label={f.label} hint={f.long ? undefined : `中文：${f.source}`}>
            {f.long ? (
              <textarea
                dir={meta.dir}
                rows={8}
                value={current[f.key] || ''}
                onChange={e => onChange({ ...value, [lang]: { ...current, [f.key]: e.target.value } })}
                className="field field-sm"
              />
            ) : (
              <input
                type="text"
                dir={meta.dir}
                value={current[f.key] || ''}
                onChange={e => onChange({ ...value, [lang]: { ...current, [f.key]: e.target.value } })}
                className="field field-sm"
              />
            )}
          </FormField>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- factory photos

const FactoryPanel: React.FC<{ onShowToast: (m: string) => void }> = ({ onShowToast }) => {
  const photos = useFactoryPhotos();
  const [editing, setEditing] = useState<FactoryPhoto | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const uploads = useSessionUploads();
  const original = useRef<FactoryPhoto | null>(null);

  const open = (p?: FactoryPhoto) => {
    const item = p ? JSON.parse(JSON.stringify(p)) : { id: newContentId('factory'), imageUrl: '', title: '', desc: '', order: photos.length, translations: {} };
    original.current = p || null;
    setIsNew(!p);
    setEditing(item);
  };
  const close = () => {
    uploads.cleanup([original.current?.imageUrl]);
    setEditing(null);
  };
  const save = async () => {
    if (!editing) return;
    if (!editing.imageUrl) return onShowToast('请先上传图片');
    if (!editing.title.trim()) return onShowToast('请填写拍摄位置（如 生产车间）');
    setSaving(true);
    try {
      await saveFactoryPhoto({ ...editing, title: editing.title.trim(), desc: (editing.desc || '').trim() });
      uploads.cleanup([editing.imageUrl], [original.current?.imageUrl]);
      void adminApi.addAuditLog(isNew ? '新增工厂图片' : '编辑工厂图片', editing.title.trim(), isNew ? '官网「工厂介绍」' : '已更新图片或文字');
      onShowToast(isNew ? '已添加，官网「工厂介绍」已更新' : '已保存');
      setEditing(null);
    } catch (err) {
      onShowToast(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (p: FactoryPhoto) => {
    if (!window.confirm(`删除「${p.title}」这张图片？`)) return;
    try {
      await deleteFactoryPhoto(p.id);
      void deleteUploadedMedia([p.imageUrl]);
      void adminApi.addAuditLog('删除工厂图片', p.title, '官网「工厂介绍」');
      onShowToast('已删除');
    } catch (err) {
      onShowToast(`删除失败：${(err as Error).message}`);
    }
  };
  const move = async (index: number, delta: number) => {
    const next = [...photos];
    const [it] = next.splice(index, 1);
    next.splice(index + delta, 0, it);
    try {
      await reorderFactoryPhotos(next);
      void adminApi.addAuditLog('调整工厂图片顺序', it.title, `移到第 ${index + delta + 1} 位`);
    } catch (err) {
      onShowToast(`调整失败：${(err as Error).message}`);
    }
  };

  return (
    <Panel
      title={`工厂介绍（${photos.length} 张）`}
      actions={
        <button type="button" onClick={() => open()} className="btn btn-sm btn-dark">
          <Plus className="w-4 h-4" />
          添加图片
        </button>
      }
    >
      <p className="text-sm text-slate-500 mb-4">每张图片写明拍摄位置（如 生产车间、原料仓库、质检实验室）。第一张在官网显示为大图；没有图片时官网不显示这一栏。</p>
      {photos.length === 0 ? (
        <EmptyState icon={<Building2 className="w-5 h-5" />} title="还没有工厂图片" hint="点「添加图片」上传第一张。" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-line overflow-hidden bg-white">
              <div className="relative aspect-[4/3] bg-concrete">
                <img src={mediaUrl(p.imageUrl)} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                {i === 0 && <span className="absolute top-2 start-2 rounded-full bg-night/80 px-2 py-0.5 text-xs text-white">大图</span>}
              </div>
              <div className="p-3">
                <p className="font-semibold text-night truncate">{p.title}</p>
                {p.desc && <p className="text-xs text-slate-500 line-clamp-2">{p.desc}</p>}
                <div className="mt-2 flex items-center gap-1">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => void move(i, -1)} aria-label="前移" title="前移">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" className="icon-btn" disabled={i === photos.length - 1} onClick={() => void move(i, 1)} aria-label="后移" title="后移">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <span className="flex-1" />
                  <button type="button" className="icon-btn" onClick={() => open(p)} aria-label="编辑" title="编辑">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" className="icon-btn !text-rose-700" onClick={() => void remove(p)} aria-label="删除" title="删除">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={close}
        title={isNew ? '添加工厂图片' : '编辑工厂图片'}
        size="lg"
        footer={
          <>
            <button type="button" onClick={close} className="btn btn-sm btn-outline">取消</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-sm btn-dark">
              <Save className="w-4 h-4" />
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {editing && (
          <>
            <ImagePicker area="factory" value={editing.imageUrl} onChange={url => setEditing({ ...editing, imageUrl: url })} onUploaded={uploads.add} />
            <div className="mt-4 grid gap-3">
              <FormField label="拍摄位置（必填）" hint="显示在图片下方，如 生产车间 / 原料仓库 / 质检实验室">
                <input type="text" maxLength={120} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="field field-sm" />
              </FormField>
              <FormField label="补充说明（选填）" hint="如 6 条自动化生产线，月产 800 吨">
                <input type="text" maxLength={500} value={editing.desc || ''} onChange={e => setEditing({ ...editing, desc: e.target.value })} className="field field-sm" />
              </FormField>
            </div>
            <TranslationTabs
              fields={[
                { key: 'title', label: '拍摄位置', source: editing.title },
                { key: 'desc', label: '补充说明', source: editing.desc || '' }
              ]}
              value={(editing.translations || {}) as Translations<'title' | 'desc'>}
              onChange={t => setEditing({ ...editing, translations: t })}
            />
          </>
        )}
      </Modal>
    </Panel>
  );
};

// ---------------------------------------------------------------- news

const today = () => new Date().toISOString().slice(0, 10);

const NewsPanel: React.FC<{ onShowToast: (m: string) => void }> = ({ onShowToast }) => {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [editing, setEditing] = useState<NewsPost | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const uploads = useSessionUploads();
  const original = useRef<NewsPost | null>(null);

  useEffect(() => subscribeAllNews(setPosts, err => onShowToast(`新闻读取失败：${err.message}`)), [onShowToast]);

  const open = (p?: NewsPost) => {
    original.current = p || null;
    setIsNew(!p);
    setEditing(p ? JSON.parse(JSON.stringify(p)) : { id: newContentId('news'), title: '', summary: '', content: '', coverUrl: '', images: [], date: today(), published: true, translations: {} });
  };
  const close = () => {
    uploads.cleanup([original.current?.coverUrl, ...(original.current?.images || [])]);
    setEditing(null);
  };
  const save = async (publish?: boolean) => {
    if (!editing) return;
    if (!editing.title.trim()) return onShowToast('请填写标题');
    if (!editing.content.trim()) return onShowToast('请填写正文');
    const post: NewsPost = { ...editing, title: editing.title.trim(), summary: (editing.summary || '').trim(), content: editing.content.trim(), published: publish ?? editing.published };
    setSaving(true);
    try {
      await saveNewsPost(post);
      const keep = [post.coverUrl, ...(post.images || [])];
      uploads.cleanup(keep, [original.current?.coverUrl, ...(original.current?.images || [])]);
      void adminApi.addAuditLog(isNew ? '发布公司新闻' : '编辑公司新闻', post.title, post.published ? `已发布｜日期 ${post.date}` : '草稿（官网不显示）');
      onShowToast(post.published ? '已保存，官网「公司新闻」已更新' : '已存为草稿');
      setEditing(null);
    } catch (err) {
      onShowToast(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (p: NewsPost) => {
    if (!window.confirm(`删除新闻「${p.title}」？`)) return;
    try {
      await deleteNewsPost(p.id);
      void deleteUploadedMedia([p.coverUrl, ...(p.images || [])].filter((u): u is string => !!u));
      void adminApi.addAuditLog('删除公司新闻', p.title, `日期 ${p.date}`);
      onShowToast('已删除');
    } catch (err) {
      onShowToast(`删除失败：${(err as Error).message}`);
    }
  };
  const togglePublished = async (p: NewsPost) => {
    try {
      await saveNewsPost({ ...p, published: !p.published });
      void adminApi.addAuditLog(p.published ? '下架公司新闻' : '发布公司新闻', p.title, p.published ? '改为草稿，官网不再显示' : '官网可见');
    } catch (err) {
      onShowToast(`操作失败：${(err as Error).message}`);
    }
  };

  const images = editing?.images || [];
  return (
    <Panel
      title={`公司新闻（${posts.length} 篇）`}
      actions={
        <button type="button" onClick={() => open()} className="btn btn-sm btn-dark">
          <Plus className="w-4 h-4" />
          写新闻
        </button>
      }
    >
      <p className="text-sm text-slate-500 mb-4">官网按日期从新到旧显示已发布的新闻，先显示 3 篇；草稿只在这里可见。没有已发布的新闻时官网不显示这一栏。</p>
      {posts.length === 0 ? (
        <EmptyState icon={<Newspaper className="w-5 h-5" />} title="还没有新闻" hint="点「写新闻」发布第一篇。" />
      ) : (
        <div className="divide-y divide-line">
          {posts.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-3">
              <div className="w-20 h-14 shrink-0 overflow-hidden rounded-lg bg-concrete">
                {p.coverUrl ? <img src={mediaUrl(p.coverUrl)} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <Newspaper className="w-5 h-5 m-auto mt-4 text-slate-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-night truncate">{p.title}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-sign">{p.date}</span>
                  {' · '}
                  {p.summary || p.content.slice(0, 60)}
                </p>
              </div>
              <Chip tone={p.published ? 'emerald' : 'slate'}>{p.published ? '已发布' : '草稿'}</Chip>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void togglePublished(p)}>
                {p.published ? '下架' : '发布'}
              </button>
              <button type="button" className="icon-btn" onClick={() => open(p)} aria-label="编辑" title="编辑">
                <Pencil className="w-4 h-4" />
              </button>
              <button type="button" className="icon-btn !text-rose-700" onClick={() => void remove(p)} aria-label="删除" title="删除">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={close}
        title={isNew ? '写新闻' : '编辑新闻'}
        size="xl"
        footer={
          <>
            <button type="button" onClick={close} className="btn btn-sm btn-outline">取消</button>
            <button type="button" onClick={() => void save(false)} disabled={saving} className="btn btn-sm btn-outline">存为草稿</button>
            <button type="button" onClick={() => void save(true)} disabled={saving} className="btn btn-sm btn-dark">
              <Save className="w-4 h-4" />
              {saving ? '保存中…' : '保存并发布'}
            </button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="grid gap-3 content-start">
              <FormField label="标题（必填）">
                <input type="text" maxLength={200} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="field field-sm" />
              </FormField>
              <FormField label="摘要（选填）" hint="显示在新闻卡片上；不填则截取正文开头">
                <input type="text" maxLength={500} value={editing.summary || ''} onChange={e => setEditing({ ...editing, summary: e.target.value })} className="field field-sm" />
              </FormField>
              <FormField label="正文（必填）" hint="空一行分段">
                <textarea rows={12} maxLength={20000} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} className="field field-sm" />
              </FormField>
              <TranslationTabs
                fields={[
                  { key: 'title', label: '标题', source: editing.title },
                  { key: 'summary', label: '摘要', source: editing.summary || '' },
                  { key: 'content', label: '正文', source: editing.content, long: true }
                ]}
                value={(editing.translations || {}) as Translations<'title' | 'summary' | 'content'>}
                onChange={t => setEditing({ ...editing, translations: t })}
              />
            </div>
            <div className="grid gap-4 content-start">
              <FormField label="日期" hint="官网显示的日期">
                <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value || today() })} className="field field-sm font-sign" />
              </FormField>
              <div>
                <span className="field-label">封面图</span>
                <ImagePicker area="news" aspect="aspect-[16/10]" label="上传封面" value={editing.coverUrl || ''} onChange={url => setEditing({ ...editing, coverUrl: url })} onUploaded={uploads.add} />
              </div>
              <div>
                <span className="field-label">正文配图（选填，最多 12 张）</span>
                <div className="grid grid-cols-3 gap-2">
                  {images.map(src => (
                    <div key={src} className="relative aspect-square overflow-hidden rounded-lg bg-concrete">
                      <img src={mediaUrl(src)} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setEditing({ ...editing, images: images.filter(u => u !== src) })} className="absolute top-1 end-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-night/70 text-white" aria-label="移除">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {images.length < 12 && (
                  <div className="mt-2">
                    <ImagePicker
                      area="news"
                      aspect="aspect-[3/1]"
                      label="添加配图"
                      value=""
                      onChange={url => url && setEditing(e => (e ? { ...e, images: [...(e.images || []), url].slice(0, 12) } : e))}
                      onUploaded={uploads.add}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  );
};

// ---------------------------------------------------------------- floating widget

const FLOAT_LINKS: { key: 'alibabaUrl' | 'facebookUrl' | 'linkedinUrl' | 'youtubeUrl' | 'tiktokUrl'; label: string; placeholder: string }[] = [
  { key: 'alibabaUrl', label: '阿里巴巴国际站店铺', placeholder: 'https://xxx.en.alibaba.com' },
  { key: 'facebookUrl', label: 'Facebook', placeholder: 'https://www.facebook.com/…' },
  { key: 'linkedinUrl', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/company/…' },
  { key: 'youtubeUrl', label: 'YouTube', placeholder: 'https://www.youtube.com/@…' },
  { key: 'tiktokUrl', label: 'TikTok', placeholder: 'https://www.tiktok.com/@…' }
];

const FloatingPanel: React.FC<{ onShowToast: (m: string) => void }> = ({ onShowToast }) => {
  const cfg = useSiteContactConfig();
  const [qr, setQr] = useState(cfg.wechatQrUrl);
  const [links, setLinks] = useState(() => Object.fromEntries(FLOAT_LINKS.map(l => [l.key, cfg[l.key]])) as Record<(typeof FLOAT_LINKS)[number]['key'], string>);
  const [saving, setSaving] = useState(false);
  const uploads = useSessionUploads();

  useEffect(() => {
    setQr(cfg.wechatQrUrl);
    setLinks(Object.fromEntries(FLOAT_LINKS.map(l => [l.key, cfg[l.key]])) as typeof links);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.wechatQrUrl, cfg.alibabaUrl, cfg.facebookUrl, cfg.linkedinUrl, cfg.youtubeUrl, cfg.tiktokUrl]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const before = cfg;
      const saved = await saveSiteContactConfig({ wechatQrUrl: qr, ...links });
      uploads.cleanup([saved.wechatQrUrl], [before.wechatQrUrl]);
      const changes = [
        before.wechatQrUrl !== saved.wechatQrUrl ? `公众号二维码：${saved.wechatQrUrl ? '已更新' : '已移除'}` : '',
        ...FLOAT_LINKS.filter(l => (before[l.key] || '') !== saved[l.key]).map(l => `${l.label}：${before[l.key] || '空'} → ${saved[l.key] || '空'}`)
      ].filter(Boolean);
      if (changes.length) void adminApi.addAuditLog('修改官网浮窗', '右下角浮窗', changes.join('；'));
      onShowToast('已保存，官网右下角浮窗已更新');
    } catch (err) {
      onShowToast(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      as="form"
      onSubmit={save}
      title="右下角浮窗"
      actions={
        <button type="submit" disabled={saving} className="btn btn-sm btn-dark">
          <Save className="w-4 h-4" />
          {saving ? '保存中…' : '保存'}
        </button>
      }
    >
      <p className="text-sm text-slate-500 mb-4">
        官网右下角的悬浮按钮：鼠标移上去显示公众号二维码或名称，点击打开对应页面。留空的项不显示。WhatsApp 按钮使用「经营概览 → 官网联系方式」里的号码。
      </p>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div>
          <span className="field-label inline-flex items-center gap-1.5">
            <QrCode className="w-4 h-4" />
            微信公众号二维码
          </span>
          <ImagePicker area="contact" aspect="aspect-square" label="上传二维码" value={qr} onChange={setQr} onUploaded={uploads.add} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 content-start">
          {FLOAT_LINKS.map(l => (
            <FormField key={l.key} label={l.label}>
              <input type="text" inputMode="url" value={links[l.key]} onChange={e => setLinks({ ...links, [l.key]: e.target.value })} placeholder={l.placeholder} className="field field-sm font-sign" />
            </FormField>
          ))}
        </div>
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------- page

type Section = 'factory' | 'news' | 'floating';

export const SiteContentView: React.FC<{ onShowToast: (m: string) => void }> = ({ onShowToast }) => {
  const [section, setSection] = useState<Section>('factory');
  return (
    <div>
      <PageHeader title="官网内容" description="官网首页的工厂介绍、公司新闻和右下角浮窗。新款推荐在「商品库」里勾选。" />
      <div className="segmented mb-5" role="group" aria-label="内容">
        {(
          [
            ['factory', '工厂介绍'],
            ['news', '公司新闻'],
            ['floating', '右下角浮窗']
          ] as [Section, string][]
        ).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={section === key} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </div>
      {section === 'factory' && <FactoryPanel onShowToast={onShowToast} />}
      {section === 'news' && <NewsPanel onShowToast={onShowToast} />}
      {section === 'floating' && <FloatingPanel onShowToast={onShowToast} />}
    </div>
  );
};
