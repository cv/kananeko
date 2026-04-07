export type Pair<T> = readonly [T, T];
export type Triple<T> = readonly [T, T, T];
export type Quad<T> = readonly [T, T, T, T];
export type Quint<T> = readonly [T, T, T, T, T];
export type NonEmpty<T> = readonly [T, ...T[]];

export type TupleKeys<T extends readonly unknown[]> = Exclude<keyof T, keyof (readonly unknown[])>;
export type TupleIndex<T extends readonly unknown[]> =
  TupleKeys<T> extends infer K ? (K extends `${infer N extends number}` ? N : never) : never;
