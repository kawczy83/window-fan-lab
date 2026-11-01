import { WIND } from "./model.js?v=2.6.0";
import { setPressed } from "./dom.js?v=2.6.0";

const DIRECTIONS=["N","NE","E","SE","S","SW","W","NW"];
function oppositeDirection(direction){
  const index=DIRECTIONS.indexOf(direction);
  if(index<0)throw new Error(`Unknown wind direction: ${direction}`);
  return DIRECTIONS[(index+4)%8];
}
function windDescription(toward,speed){
  const from=oppositeDirection(toward);
  return `FROM ${WIND[from].name} → TOWARD ${WIND[toward].name} ${WIND[toward].arrow} · ${speed} mph`;
}

function createWindControls({refs,onChange}){
  let toward="S",speed=5,source="Manual";
  function render(){
    const from=oppositeDirection(toward);
    refs.currentWindDir.querySelectorAll("button").forEach(button=>setPressed(button,button.dataset.v===from));
    refs.currentWs.value=speed;
    refs.currentWsVal.textContent=`${speed} mph`;
    refs.windPreview.textContent=windDescription(toward,speed);
    refs.environmentSummary.textContent=`${source} · ${from} → ${toward} · ${speed} mph`;
  }
  function apply(nextToward,nextSpeed=speed,nextSource="Manual"){
    toward=nextToward;speed=nextSpeed;source=nextSource;
    render();onChange(toward,speed);
  }
  refs.currentWindDir.addEventListener("click",event=>{
    const button=event.target.closest("button");if(!button)return;
    apply(oppositeDirection(button.dataset.v));
  });
  refs.currentWs.addEventListener("input",event=>apply(toward,+event.target.value,source));
  refs.windSourceSwitch.addEventListener("click",event=>{
    const button=event.target.closest("button");if(!button)return;
    const manual=button.dataset.source==="manual";
    refs.windSourceSwitch.querySelectorAll("button").forEach(item=>setPressed(item,item===button));
    refs.manualWindPanel.hidden=!manual;
    refs.historyWindPanel.hidden=manual;
  });
  render();
  return {apply};
}
export { oppositeDirection, windDescription, createWindControls };
