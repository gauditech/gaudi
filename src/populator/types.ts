type PopulatorModel = {
  model: string;
  repeat: { min: number; max: number } | number;
  data: PopulatorData[];
};

type PopulatorData = {
  field: string;
  type: "constant" | "";
};
