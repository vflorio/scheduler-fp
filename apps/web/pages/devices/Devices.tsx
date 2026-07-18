import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";

export function Devices() {
  const { devices } = useData<Data>();
  return match(devices)
    .with({ ok: true }, ({ data }) => <pre>{JSON.stringify(data, null, 2)}</pre>)
    .with({ ok: false }, ({ error }) => <p>Devices error: {error.message}</p>)
    .exhaustive();
}
