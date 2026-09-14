import { buildJulesConfig, parseJulesStdoutLine } from "@paperclipai/adapter-jules/ui";
import type { UIAdapterModule } from "../types";
import { JulesConfigFields } from "./config-fields";
export const julesUIAdapter: UIAdapterModule = { type: "jules", label: "Google Jules (remote)", parseStdoutLine: parseJulesStdoutLine, ConfigFields: JulesConfigFields, buildAdapterConfig: buildJulesConfig };
