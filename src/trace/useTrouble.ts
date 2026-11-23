import { useEffect, useState } from "react";
import { subscribeTrouble, type Trouble } from "../shared/esplora/transport";

/** The latest trouble the data sources gave (undefined when they are answering normally). */
export function useTrouble(): Trouble {
  const [trouble, setTrouble] = useState<Trouble>();
  useEffect(() => subscribeTrouble(setTrouble), []);
  return trouble;
}
