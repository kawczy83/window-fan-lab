// Display units for temperature. The simulation always runs in °F (its calibration and thresholds are
// in °F); these helpers convert only at the edges: readouts, sliders, charts and canvas labels.
const UNIT_KEY="window-fan-lab-unit";
const SLIDER_RANGE={F:{min:40,max:95},C:{min:4,max:35}}; // the same span: 40–95°F ≈ 4.4–35°C

function normalizeUnit(unit){return unit==="C"?"C":"F";}
function toUnit(fahrenheit,unit){return unit==="C"?(fahrenheit-32)*5/9:fahrenheit;}
function fromUnit(value,unit){return unit==="C"?value*9/5+32:value;}
function unitSymbol(unit){return unit==="C"?"°C":"°F";}
function unitName(unit){return unit==="C"?"Celsius":"Fahrenheit";}
function formatTemp(fahrenheit,unit,digits){
  // Fixed digits when asked; otherwise whole values stay whole and the rest get one decimal.
  const value=toUnit(fahrenheit,unit);
  if(digits!=null)return value.toFixed(digits);
  const whole=Math.round(value);
  return Math.abs(value-whole)<0.05?String(whole):value.toFixed(1);
}
function formatTempWithUnit(fahrenheit,unit){return formatTemp(fahrenheit,unit)+unitSymbol(unit);}
function labelTempSlider(input,label,fahrenheit,unit){
  const text=formatTempWithUnit(fahrenheit,unit);
  label.textContent=text;
  if(input.setAttribute)input.setAttribute("aria-valuetext",text);
}
function syncTempSlider(input,label,fahrenheit,unit){
  // Re-scale a temperature slider to the chosen unit without changing the temperature it holds;
  // the label shows the exact value even when the thumb has to round to a whole degree.
  const range=SLIDER_RANGE[normalizeUnit(unit)];
  input.min=range.min;input.max=range.max;input.step=1;
  input.value=Math.round(toUnit(fahrenheit,unit));
  labelTempSlider(input,label,fahrenheit,unit);
}
function loadUnit(storage){try{return normalizeUnit(storage&&storage.getItem(UNIT_KEY));}catch(err){return "F";}}
function saveUnit(storage,unit){try{if(storage)storage.setItem(UNIT_KEY,normalizeUnit(unit));}catch(err){}}

export {
  SLIDER_RANGE,
  normalizeUnit,
  toUnit,
  fromUnit,
  unitSymbol,
  unitName,
  formatTemp,
  formatTempWithUnit,
  labelTempSlider,
  syncTempSlider,
  loadUnit,
  saveUnit,
};
