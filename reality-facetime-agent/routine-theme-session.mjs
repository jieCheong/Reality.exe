import { ThemeSelection } from './theme-selection.mjs';
import { RoutineSession } from './routine-session.mjs';
/** Theme selection before any routine timer, frame upload or mission start. */
export class RoutineThemeSession extends ThemeSelection {
  constructor(options) {
    super(options);this.routineSession=new RoutineSession(options);
  }
  renderMenu() {
    if(this.game.started||this.state==='closed')return;
    const state=this.game.presentation.snapshot(this.game.engine.hudState(),{pauseReasons:[...this.game.pauseReasons]});
    this.game.hud.setState({gameState:{...state,themeMenu:{state:this.state,candidateId:this.candidate?.id??null,
      themes:this.rawThemes.map(t=>({id:t.id,name:t.name,description:t.description??t.intro??''}))}}});
  }
  async utter(text,after,options) {
    this.renderMenu();const completed=await super.utter(text,after,options);this.renderMenu();return completed;
  }
  async handleTranscript(event) {
    if(this.game.started)return this.routineSession.handleTranscript(event);
    await super.handleTranscript(event);
    if(this.game.started)this.routineSession.start();
  }
  close() {this.version++;this.state='closed';return this.routineSession.close();}
}
