import { isEmbeddedOrOpened } from "./isolation";

export function App() {
  if (isEmbeddedOrOpened()) {
    return (
      <main className="c-shell">
        <p role="alert">
          Refusing to run inside a frame or an opened window. 请在独立的标签页中直接打开本页面。
        </p>
      </main>
    );
  }
  return (
    <main className="c-shell">
      <h1>Cipher</h1>
    </main>
  );
}
