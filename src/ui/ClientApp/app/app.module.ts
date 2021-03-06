import { HandConfirmationService } from './services/hand-confirmation.service';
import { GameDatabaseService } from './services/game-database.service';
import { StateService } from './services/state.service';
import { LoadingComponent } from './components/app/loading.component';
import { ConfigService } from './services/config.service';
import { RespondChallengeComponent } from './components/game/respond-challenge.component';
import { GameListComponent } from './components/game-list/game-list.component';
import { ChallengePlayerComponent } from './components/game/challenge-player.component';
import { Http, RequestOptions, ConnectionBackend, XHRBackend } from '@angular/http';
import { GamesService } from './services/games.service';
import { AuthenticatedHttp, resolveAuthenticatedHttp } from './services/authenticated-http';
import { ChooseHandComponent } from './components/choose-hand/choose-hand.component';
import { Web3ProviderService } from './services/web3provider.service';
import { WalletService } from './services/wallet.service';
import { UserService } from './services/user.service';
import { AuthenticationCanActivateService } from './services/authentication.can-activate.service';
import { NgModule } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { UniversalModule } from 'angular2-universal';
import { AppComponent } from './components/app/app.component'
import { NavMenuComponent } from './components/navmenu/navmenu.component';
import { HomeComponent } from './components/home/home.component';
import { PlayerListComponent } from "./components/player-list/player-list.component";
import { RegisterComponent } from "./components/register/register.component";
import { FormsModule } from "@angular/forms";

@NgModule({
    bootstrap: [ AppComponent ],
    declarations: [
        AppComponent,
        NavMenuComponent,
        HomeComponent,
        PlayerListComponent,
        RegisterComponent,
        ChooseHandComponent,
        ChallengePlayerComponent,
        GameListComponent,
        RespondChallengeComponent,
        LoadingComponent
    ],
    providers: [
        UserService, 
        AuthenticationCanActivateService, 
        WalletService, 
        Web3ProviderService, 
        { provide: AuthenticatedHttp, useFactory: resolveAuthenticatedHttp, deps: [UserService, Router, XHRBackend, RequestOptions] },
        GamesService,
        GameDatabaseService,
        HandConfirmationService,
        ConfigService,
        StateService
    ],
    imports: [
        UniversalModule, // Must be first import. This automatically imports BrowserModule, HttpModule, and JsonpModule too.
        FormsModule,
        RouterModule.forRoot([
            { path: '', redirectTo: 'home', pathMatch: 'full'},
            { path: 'home', component: HomeComponent, canActivate: [AuthenticationCanActivateService]},
            { path: 'players', component: PlayerListComponent, canActivate: [AuthenticationCanActivateService]},
            { path: 'register', component: RegisterComponent},
            { path: 'challenge/:playerid/:playername', component: ChallengePlayerComponent, canActivate: [AuthenticationCanActivateService]},
            { path: 'respond-challenge/:gameid/:playername', component: RespondChallengeComponent, canActivate: [AuthenticationCanActivateService]},
            { path: '**', redirectTo: 'home'}
        ])
    ]
})
export class AppModule {
}
