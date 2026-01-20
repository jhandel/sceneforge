export function hasFlag(args, name) {
  return args.includes(name);
}

export function getFlagValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return value ?? null;
}

export function getFlagValueOrDefault(args, name, defaultValue) {
  const value = getFlagValue(args, name);
  return value === null ? defaultValue : value;
}
