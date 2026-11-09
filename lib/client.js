window.__ModuleLoader__.load({
	id: "dsh-routerai-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const react = require("react");
		const h = react.createElement;

		/** Host route that proxies the free RouterAI credits endpoint. */
		const ROUTE = "/routerai-balance";
		const DETAILS_URL = "https://routerai.ru/settings/billing";
		/**
		 * Fallback poll interval, used only until the Host reports the real one.
		 * The effective value is the profile setting `intervalSeconds` under this
		 * entry, so the panel follows the Host without a reload.
		 */
		const DEFAULT_INTERVAL_MS = 10000;
		/** Balance bands in rubles: <=LOW is critical, <WARN is "worth thinking about". */
		const LOW = 100;
		const WARN = 300;
		const BASELINE_KEY = "dsh-routerai-balance:baseline";

		const COLOR_LOW = "var(--dsw-alias-state-error-primary, #e5484d)";
		const COLOR_WARN = "var(--dsw-alias-state-warning-primary, #d97706)";
		const COLOR_OK = "var(--dsw-alias-label-secondary, inherit)";
		const COLOR_MUTED = "var(--dsw-alias-label-tertiary, inherit)";

		function money(value) {
			return value.toLocaleString("ru-RU", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}) + " ₽";
		}

		function colorFor(value) {
			if (value <= LOW) return COLOR_LOW;
			if (value < WARN) return COLOR_WARN;
			return COLOR_OK;
		}

		/** Session-scoped baseline, so the delta survives a page reload. */
		function readBaseline() {
			try {
				const raw = sessionStorage.getItem(BASELINE_KEY);
				if (raw === null) return null;
				const parsed = Number(raw);
				return Number.isFinite(parsed) ? parsed : null;
			} catch {
				return null;
			}
		}

		function writeBaseline(value) {
			try {
				sessionStorage.setItem(BASELINE_KEY, String(value));
			} catch {}
		}

		function WalletIcon() {
			return h("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.8,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				style: { display: "block", flex: "none" }
			}, h("path", { d: "M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1" }), h("path", { d: "M3 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-1.5Z" }), h("circle", {
				cx: "16.5",
				cy: "14",
				r: "1.1",
				fill: "currentColor",
				stroke: "none"
			}));
		}

		function Balance(props) {
			const wide = props.wide !== false;
			const [state, setState] = react.useState({ status: "loading" });
			const [hover, setHover] = react.useState(false);
			react.useEffect(() => {
				let alive = true;
				let timer = null;
				/** A failed poll keeps the last good value instead of blanking the block. */
				const load = () => {
					fetch(ROUTE, { cache: "no-store" }).then((response) => response.json()).then((payload) => {
						if (!alive || !payload) return;
						if (payload.ok !== true || typeof payload.credits !== "number") {
							setState({ status: "error", reason: payload && payload.error ? payload.error : "unreachable", at: Date.now() });
							return;
						}
					/** Follow the interval the Host reports; a settings change then needs no reload. */
					applyInterval(payload.intervalMs);
						const baseline = readBaseline();
						if (baseline === null) {
							writeBaseline(payload.credits);
							setState({
								status: "ok",
								credits: payload.credits,
								delta: 0,
								at: Date.now()
							});
							return;
						}
						setState({
							status: "ok",
							credits: payload.credits,
							delta: payload.credits - baseline,
							at: Date.now()
						});
					}).catch(() => {});
				};
				/** Effective interval, replaced whenever the Host reports a new one. */
				let interval = DEFAULT_INTERVAL_MS;
				/**
				 * Adopt the interval the Host reports. A change restarts the timer so the
				 * next poll already uses the new value; an absent or bogus value is ignored.
				 */
				const applyInterval = (next) => {
					if (typeof next !== "number" || !isFinite(next) || next < 5000) return;
					if (next === interval) return;
					interval = next;
					if (timer !== null) {
						clearInterval(timer);
						timer = setInterval(load, interval);
					}
				};
				const start = () => {
					if (timer === null) timer = setInterval(load, interval);
				};
				const stop = () => {
					if (timer !== null) {
						clearInterval(timer);
						timer = null;
					}
				};
				/** No polling while the window is hidden; one refresh on return. */
				const onVisibility = () => {
					if (document.hidden) stop();
					else {
						load();
						start();
					}
				};
				load();
				if (!document.hidden) start();
				document.addEventListener("visibilitychange", onVisibility);
				return () => {
					alive = false;
					stop();
					document.removeEventListener("visibilitychange", onVisibility);
				};
			}, []);
			/** Human text for the Host refusal, so the panel never just shows a dash. */
			const reasonText = (reason) => {
				if (reason === "no-key") return "Ключ RouterAI не задан";
				if (typeof reason === "string" && reason.indexOf("http-") === 0) return "RouterAI ответил " + reason.slice(5);
				return "RouterAI недоступен";
			};
			const ok = state.status === "ok";
			const delta = ok ? state.delta : 0;
			const showDelta = wide && Math.abs(delta) >= 0.005;
			return h("a", {
				href: DETAILS_URL,
				target: "_blank",
				rel: "noopener noreferrer",
				title: ok ? "RouterAI · обновлено " + new Date(state.at).toLocaleTimeString("ru-RU", {
					hour: "2-digit",
					minute: "2-digit"
				}) : "RouterAI · " + reasonText(state.reason).toLowerCase(),
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
				style: {
					display: "flex",
					alignItems: "center",
					gap: "6px",
					minWidth: 0,
					overflow: "hidden",
					boxSizing: "border-box",
					padding: wide ? "10px 14px" : "6px 4px",
					margin: "10px auto 10px auto",
					borderRadius: "8px",
					textDecoration: "none",
					color: "inherit",
					cursor: "pointer",
					background: hover ? "rgba(127,127,127,0.25)" : "rgba(127,127,127,0.15)",
					transition: "background 120ms ease",
					fontVariantNumeric: "tabular-nums",
					userSelect: "none"
				}
			}, h("span", {
				style: { display: "flex", color: COLOR_MUTED }
			}, h(WalletIcon, null)), h("span", {
				style: {
					display: wide ? "block" : "none",
					flex: "1 1 auto",
					minWidth: 0,
					fontSize: "12px",
					lineHeight: "16px",
					fontWeight: 200,
					color: COLOR_MUTED,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				}
			}, "Баланс:"), h("span", {
				style: {
					flex: "none",
					marginLeft: "auto",
					fontSize: "12px",
					lineHeight: "16px",
					fontWeight: 600,
					whiteSpace: "nowrap",
					color: ok ? colorFor(state.credits) : COLOR_MUTED
				}
			}, ok ? money(state.credits) : state.status === "loading" ? "…" : state.status === "error" ? reasonText(state.reason) : "—"), showDelta ? h("span", {
				style: {
					flex: "none",
					marginLeft: "3px",
					fontSize: "11px",
					lineHeight: "11px",
					fontWeight: 500,
					whiteSpace: "nowrap",
					color: COLOR_MUTED
				}
			}, (delta < 0 ? "−" : "+") + money(Math.abs(delta))) : null);
		}

		/** The interval route the Host serves beside the balance feed. */
		const ROUTE_INTERVAL = "/routerai-balance/interval";

		/**
		 * The refresh-interval row in Settings, next to the other preferences.
		 *
		 * The value lives on the Host (it is the profile setting the balance panel
		 * follows), so this row reads it once and writes it back through the same
		 * route. A failed write leaves the field untouched and says so.
		 */
		function IntervalRow() {
			const [state, setState] = react.useState({ status: "loading" });
			const [draft, setDraft] = react.useState("");

			react.useEffect(() => {
				let alive = true;
				fetch(ROUTE_INTERVAL, { cache: "no-store" })
					.then((response) => response.json())
					.then((payload) => {
						if (!alive || !payload || payload.ok !== true) return;
						setState({ status: "ok", value: payload.intervalSeconds, writable: payload.writable !== false, min: payload.min, max: payload.max });
						setDraft(String(payload.intervalSeconds));
					})
					.catch(() => {
						if (alive) setState({ status: "error" });
					});
				return () => {
					alive = false;
				};
			}, []);

			const busy = state.status === "saving";
			const save = () => {
				/**
				 * A blank field is not zero: Number("") is 0, which would pass a plain
				 * finite check and let the Host clamp a value the user never typed. Refuse
				 * anything that is not a typed number, and refuse values outside the range
				 * here rather than silently rewriting them.
				 */
				const trimmed = draft.trim();
				const next = trimmed.length === 0 ? NaN : Number(trimmed);
				const min = state.min === undefined ? 5 : state.min;
				const max = state.max === undefined ? 300 : state.max;
				if (!isFinite(next) || next < min || next > max) {
					setState(Object.assign({}, state, { error: "number" }));
					return;
				}
				setState(Object.assign({}, state, { status: "saving", error: undefined }));
				fetch(ROUTE_INTERVAL, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ intervalSeconds: next })
				})
					.then((response) => response.json())
					.then((payload) => {
						if (!payload || payload.ok !== true) {
							setState(Object.assign({}, state, { status: "ok", error: "failed" }));
							return;
						}
						setState({ status: "ok", value: payload.intervalSeconds, writable: true, min: state.min, max: state.max, saved: true });
						setDraft(String(payload.intervalSeconds));
					})
					.catch(() => setState(Object.assign({}, state, { status: "ok", error: "failed" })));
			};

			const disabled = state.status === "loading" || state.status === "error" || state.writable === false || busy;
			return h("div", {
				style: { display: "flex", flexDirection: "column", gap: "6px", padding: "2px 0" }
			}, [
				h("div", {
					key: "label",
					style: { fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-primary, inherit)" }
				}, "RouterAI · интервал обновления баланса"),
				h("div", {
					key: "row",
					style: { display: "flex", alignItems: "center", gap: "8px" }
				}, [
					h("input", {
						key: "input",
						type: "number",
						value: draft,
						min: state.min === undefined ? 5 : state.min,
						max: state.max === undefined ? 300 : state.max,
						disabled: disabled,
						onChange: (event) => setDraft(event.target.value),
						style: {
							width: "90px",
							padding: "4px 6px",
							font: "inherit",
							fontSize: "13px",
							color: "var(--dsw-alias-label-primary, inherit)",
							background: "var(--dsw-alias-bg-layer-1, transparent)",
							border: "1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.35))",
							borderRadius: "4px"
						}
					}),
					h("span", {
						key: "unit",
						style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary, inherit)" }
					}, "сек"),
					h("button", {
						key: "save",
						type: "button",
						disabled: disabled,
						onClick: save,
						style: {
							padding: "4px 10px",
							font: "inherit",
							fontSize: "13px",
							cursor: disabled ? "default" : "pointer",
							color: "var(--dsw-alias-label-primary, inherit)",
							background: "var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.16))",
							border: "1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.35))",
							borderRadius: "4px"
						}
					}, busy ? "Сохранение…" : "Сохранить"),
				]),
				state.error === "number" ? h("div", {
					key: "bad",
					style: { fontSize: "12px", color: "var(--dsw-alias-state-error-primary, #e5484d)" }
				}, "Введите целое число секунд от " + (state.min || 5) + " до " + (state.max || 300) + ".") : null,
				state.error === "failed" ? h("div", {
					key: "fail",
					style: { fontSize: "12px", color: "var(--dsw-alias-state-error-primary, #e5484d)" }
				}, "Не удалось сохранить значение — оно осталось прежним.") : null,
				state.writable === false ? h("div", {
					key: "ro",
					style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, inherit)" }
				}, "В этом развёртывании настройка только для чтения.") : null,
				h("div", {
					key: "hint",
					style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, inherit)" }
				}, "Как часто панель баланса запрашивает данные, от " + (state.min || 5) + " до " + (state.max || 300) + " секунд.")
			]);
		}

		/** Only the slot service: no locale namespace, no other dependency. */
		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "routerai-balance",
				order: 100
			}, Balance));
			/**
			 * The interval control, on this bundle page in Plugins: between the
			 * description and the rows, where a plugin settings belong. The page view
			 * means the form owns its save control.
			 */
			ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-routerai-balance"
			}, IntervalRow));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
