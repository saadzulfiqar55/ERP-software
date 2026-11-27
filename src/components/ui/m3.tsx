/**
 * Material Design 3 Reusable Component Library Barrel
 * Each component lives in its own dedicated file under `src/components/ui/*`
 * so you can edit it once and update the entire ERP.
 */
export { Button, ExtendedFab, type M3ButtonProps } from "./Button";
export {
  OutlinedTextField,
  CompactField,
  type OutlinedTextFieldProps,
} from "./OutlinedTextField";
export {
  StatusChip,
  FilterChip,
  SegmentedButton,
  mapInvoiceStatusToChipVariant,
  type StatusChipVariant,
} from "./Chip";
export { Card, StatCard } from "./Card";
export { Switch, Checkbox } from "./Switch";
export {
  NavItem,
  SearchBar,
  ProgressBar,
  PageHeader,
  Avatar,
  EmptyState,
  Snackbar,
} from "./Navigation";
export {
  ThemeToggle,
  ThemeSelector,
  useThemePreference,
  type ThemePreference,
  type ResolvedTheme,
} from "./ThemeToggle";
export {
  M3Select,
  CompactSelect,
  type M3SelectOption,
} from "./Select";
export { Dialog } from "./Dialog";
