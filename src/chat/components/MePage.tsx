import { useState } from "react";
import { Settings as SettingsIcon, Star } from "lucide-react";
import { logout, removeFavorite } from "../client";
import { formatClock, formatDay } from "../format";
import { useChat } from "../store";
import { useLang } from "../useChat";
import { Empty, Group, Icon, Page, Row } from "./ios";
import { SettingsFlow } from "./SettingsPage";
import { Avatar } from "./ui";

function FavoritesPage({ onBack }: { onBack: () => void }) {
  const { lang, a } = useLang();
  const favorites = useChat((s) => s.favorites);
  const usage = useChat((s) => s.usage);
  const now = Date.now();
  return (
    <Page title={a.favorites} onBack={onBack} backLabel={a.tabMe}>
      {favorites.length === 0 ? (
        <Empty icon={<Star size={40} />}>{a.noFavorites}</Empty>
      ) : (
        <Group
          footer={
            <>
              {usage?.favoriteMax !== undefined && <div>{a.favoritesCount(usage.favoriteCount ?? favorites.length, usage.favoriteMax)}</div>}
              {a.favoritesNote}
            </>
          }
        >
          {favorites.map((f) => (
            <div key={f.id} className="ios-form ios-fav">
              {f.text === null ? <div className="ios-text ios-gone">{a.undecryptable}</div> : <div className="ios-text">{f.text}</div>}
              <div className="ios-fav-meta">
                <span>
                  @{f.from} · {formatDay(f.time, now, lang, { today: a.today, yesterday: a.yesterday })} {formatClock(f.time, lang)}
                </span>
                <button type="button" className="ios-link ios-destructive" onClick={() => void removeFavorite(f.id)}>
                  {a.removeFavorite}
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
  const [route, setRoute] = useState<"root" | "favorites" | "settings">("root");
  if (route === "favorites") return <FavoritesPage onBack={() => setRoute("root")} />;
  if (route === "settings") return <SettingsFlow onBack={() => setRoute("root")} />;
  return (
    <Page title={a.tabMe}>
      <Group>
        <div className="ios-profile">
          <Avatar userId={me.userId} size={64} admin={me.role === "admin"} />
          <div>
            <h2>@{me.handle}</h2>
            {me.role === "admin" && <span className="ch-admin ios-badge">{a.adminBadge}</span>}
          </div>
        </div>
      </Group>
      {usage && (
        <Group footer={usage.limit === null ? undefined : a.usageReset(new Date(usage.resetAt).toLocaleDateString())}>
          <Row title={a.usageTitle} value={a.usageValue(usage.used, usage.limit)} />
        </Group>
      )}
      <Group>
        <Row icon={<Icon color="#ff9f0a"><Star size={18} /></Icon>} title={a.favorites} value={count > 0 ? count : undefined} chevron onClick={() => setRoute("favorites")} />
        <Row icon={<Icon color="#8e8e93"><SettingsIcon size={18} /></Icon>} title={a.tabSettings} chevron onClick={() => setRoute("settings")} />
      </Group>
      <Group>
        <Row title={a.logout} center destructive onClick={() => void logout()} />
      </Group>
    </Page>
  );
}
