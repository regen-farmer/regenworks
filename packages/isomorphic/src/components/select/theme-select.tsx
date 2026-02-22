import { Match, Switch } from "solid-js";
import "./style.css";
import { setTheme, theme } from "~/theme.tsx";
import { createSignal } from "solid-js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

function ThemeDisplay(props: { themeString: string }) {
  return (
    <Switch>
      <Match when={props.themeString === "dark"}>
        <i class="fa-regular fa-moon" /> Dark
      </Match>
      <Match when={props.themeString === "light"}>
        <i class="fa-regular fa-sun" /> Light
      </Match>
      <Match when={props.themeString === "system"}>
        <i class="fa-solid fa-circle-half-stroke" /> System
      </Match>
    </Switch>
  );
}

function ThemeDisplaySimple(props: { themeString: string }) {
  return (
    <Switch>
      <Match when={props.themeString === "dark"}>
        <i class="fa-regular fa-moon" />
      </Match>
      <Match when={props.themeString === "light"}>
        <i class="fa-regular fa-sun" />
      </Match>
      <Match when={props.themeString === "system"}>
        <i class="fa-solid fa-circle-half-stroke" />
      </Match>
    </Switch>
  );
}

export function ThemeSelect() {
  const [value, setValue] = createSignal(theme());
  return (
    <Select
      value={value()}
      onChange={(val) => {
        if (val) {
          setValue(val);
          setTheme(val);
        }
      }}
      options={["dark", "light", "system"]}
      placeholder="Select theme"
      itemComponent={(props) => (
        <SelectItem item={props.item}>
          <ThemeDisplay themeString={props.item.rawValue} />
        </SelectItem>
      )}
    >
      <SelectTrigger aria-label="Theme" class="select__trigger">
        <SelectValue<string>>
          {(state) => <ThemeDisplaySimple themeString={state.selectedOption()} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent class="select__content" />
    </Select>
  );
}
