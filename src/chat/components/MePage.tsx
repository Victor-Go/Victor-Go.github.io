import { useState } from "react";
import { Settings as SettingsIcon, Star } from "lucide-react";
import { logout, removeFavorite } from "../client";
import { formatBytes, formatClock, formatDay } from "../format";
import { PATH, go, useLocation } from "../route";
import { useChat } from "../store";
import { useLang } from "../useChat";
import { Empty, Group, Icon, Page, Row } from "./ios";
import { SettingsFlow } from "./SettingsPage";
import { FavoriteMedia } from "./FavoriteMedia";
import { Avatar, TitleBadge } from "./ui";

function FavoritesPage() {
  const { lang, a } = useLang();
  const favorites = useChat((s) => s.favorites);
  const usage = useChat((s) => s.usage);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const remove = (id: string) => {
    if (removing.has(id)) return;
    setRemoving((r) => new Set(r).add(id));
    void removeFavorite(id)
      .catch(() => {})
      .finally(() =>
        setRemoving((r) => {
          const next = new Set(r);
          next.delete(id);
          return next;
        }),
      );
  };
  const now = Date.now();
  return (
    <Page title={a.favorites} onBack={() => go(PATH.me)} backLabel={a.tabMe}>
      {favorites.length === 0 ? (
        <Empty icon={<Star size={40} />}>{a.noFavorites}</Empty>
      ) : (
        <Group
          footer={
            <>
              {usage?.favoriteMax !== undefined && <div>{a.favoritesCount(usage.favoriteCount ?? favorites.length, usage.favoriteMax)}</div>}
              {usage?.favoriteFileLimit !== undefined && <div>{a.favoritesFiles(((usage.favoriteFileBytes ?? 0) / 1_000_000).toFixed(1), (usage.favoriteFileLimit / 1_000_000).toFixed(0))}</div>}
              {a.favoritesNote}
            </>
          }
        >
          {favorites.map((f) => (
            <div key={f.id} className="ios-form ios-fav">
              {f.text === null ? <div className="ios-text ios-gone">{a.undecryptable}</div> : f.kind === "voice" || f.kind === "image" ? <FavoriteMedia f={f} /> : <div className="ios-text">{f.text}</div>}
              <div className="ios-fav-meta">
                <span>
                  @{f.from} · {formatDay(f.time, now, lang, { today: a.today, yesterday: a.yesterday })} {formatClock(f.time, lang)}
                </span>
                <button type="button" className="ios-link ios-destructive" disabled={removing.has(f.id)} aria-busy={removing.has(f.id)} onClick={() => remove(f.id)}>
                  {removing.has(f.id) ? <span className="ch-spinner ch-spinner-sm" aria-hidden="true" /> : a.removeFavorite}
                </button>
              </div>
            </div>
          ))}
        </Group>
      )}
    </Page>
  );
}

/** "Me": the profile, then Favourites, Settings and Sign out, as a Settings-style list. */
export function MePage() {
  const { a } = useLang();
  const me = useChat((s) => s.me)!;
  const count = useChat((s) => s.favorites.length);
  const usage = useChat((s) => s.usage);
  const filesOff = useChat((s) => s.filesOff);
  const { path } = useLocation();
  if (path === PATH.favourites) return <FavoritesPage />;
  if (path.startsWith(PATH.settings)) return <SettingsFlow />;
  return (
    <Page title={a.tabMe}>
      <Group>
        <div className="ios-profile">
          <Avatar userId={me.userId} size={64} admin={me.role === "admin"} />
          <div>
            <h2>@{me.handle}</h2>
            <TitleBadge userId={me.userId} role={me.role} className="ios-badge" />
          </div>
        </div>
      </Group>
      {usage && (
        <Group footer={usage.limit === null ? undefined : a.usageReset(new Date(usage.resetAt).toLocaleDateString())}>
          <Row title={a.usageTitle} value={a.usageValue(usage.used, usage.limit)} />
          {!filesOff && usage.fileBytes !== undefined && (
            <Row title={a.usageFilesTitle} value={a.usageFilesValue(formatBytes(usage.fileBytes), usage.fileLimit == null ? null : Math.round(usage.fileLimit / 1_000_000))} />
          )}
        </Group>
      )}
      <Group>
        <Row icon={<Icon color="#ff9f0a"><Star size={18} /></Icon>} title={a.favorites} value={count > 0 ? count : undefined} chevron onClick={() => go(PATH.favourites)} />
        <Row icon={<Icon color="#8e8e93"><SettingsIcon size={18} /></Icon>} title={a.tabSettings} chevron onClick={() => go(PATH.settings)} />
      </Group>
      <Group>
        <Row title={a.logout} center destructive onClick={() => logout()} />
      </Group>
    </Page>
  );
}
