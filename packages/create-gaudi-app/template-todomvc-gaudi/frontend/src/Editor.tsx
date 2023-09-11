import { ChangeEvent, KeyboardEvent, useCallback, useState } from "react";

export type Props = {
  value?: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  cancelOnBlur?: boolean;

  onChange?: (value: string) => void;
  onCancel?: () => void;
};

export function Editor(props: Props) {
  const [value, setValue] = useState<string>(props.value ?? "");

  // --- event handlers

  const handleKeyboard = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const keyCode = event.code;
      if (keyCode === "Escape") {
        props.onCancel?.();

        setValue("");
      } else if (keyCode === "Enter") {
        props.onChange?.(value);

        // clear value
        setValue("");
      }
    },
    [props.onChange, props.onCancel, value, setValue]
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      // update state
      setValue(event.target.value);
    },
    [setValue]
  );

  const handleBlur = useCallback(() => {
    if (props.cancelOnBlur ?? true) {
      // clear value
      setValue("");

      props.onCancel?.();
    }
  }, [setValue, props.onCancel, props.cancelOnBlur]);

  return (
    <input
      className={props.className}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyboard}
      onBlur={handleBlur}
    />
  );
}
