import type {
  CompareOptions,
  ComparerOptions,
  EngineOptions,
  Limits,
  OnMissingBaseline,
  SizeMismatch,
  UpdatePolicy,
} from './types';

/** What one comparison runs with: the comparer's settings with the call's overrides applied. */
export type Settings = Readonly<{
  limits: Limits;
  engineOptions: EngineOptions;
  update: UpdatePolicy;
  onMissingBaseline: OnMissingBaseline;
  onSizeMismatch: SizeMismatch;
}>;

/** `limits` and the policies are replaced by the call's, `engineOptions` are merged over the comparer's. */
export const resolveSettings = (
  defaults: Pick<
    ComparerOptions,
    | 'limits'
    | 'engineOptions'
    | 'update'
    | 'onMissingBaseline'
    | 'onSizeMismatch'
  >,
  call: CompareOptions = {},
): Settings => ({
  limits: call.limits ?? defaults.limits ?? {},
  engineOptions: { ...defaults.engineOptions, ...call.engineOptions },
  update: call.update ?? defaults.update ?? 'none',
  onMissingBaseline:
    call.onMissingBaseline ?? defaults.onMissingBaseline ?? 'fail',
  onSizeMismatch: call.onSizeMismatch ?? defaults.onSizeMismatch ?? 'fail',
});
