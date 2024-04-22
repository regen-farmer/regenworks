import { Select } from "@kobalte/core";
import { Match, Switch } from "solid-js";
import "./style.css";
import { setTheme, theme } from "~/theme";

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
	return (
		<Select.Root
			options={["dark", "light", "system"]}
			placeholder="Select theme"
			value={theme()}
			onChange={setTheme}
			itemComponent={(props) => (
				<Select.Item item={props.item} class="select__item">
					<Select.ItemLabel>
						<ThemeDisplay themeString={props.item.rawValue} />
					</Select.ItemLabel>

					<Select.ItemIndicator class="select__item-indicator">
						<i class="fas fa-check" />
					</Select.ItemIndicator>
				</Select.Item>
			)}
		>
			<Select.Trigger class="select__trigger" aria-label="Fruit">
				<Select.Value<string> class="select__value">
					{(state) => (
						<ThemeDisplaySimple themeString={state.selectedOption()} />
					)}
				</Select.Value>
				{/* <Select.Icon class='select__icon'>
          <i class='fas fa-sort' />
        </Select.Icon> */}
			</Select.Trigger>
			<Select.Portal>
				<Select.Content class="select__content">
					<Select.Listbox class="select__listbox" />
				</Select.Content>
			</Select.Portal>
		</Select.Root>
	);
}
