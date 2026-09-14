import type { UIAdapterModule } from "../types";
import { HermesLocalConfigFields } from "./config-fields";
import { buildHermesConfig } from "./build-config";
import { parseHermesStdoutLine } from "./parse-stdout";

export const hermesLocalUIAdapter: UIAdapterModule = {
  type: "hermes_local",
  label: "Hermes Founder Manager",
  parseStdoutLine: parseHermesStdoutLine,
  ConfigFields: HermesLocalConfigFields,
  buildAdapterConfig: buildHermesConfig,
};
