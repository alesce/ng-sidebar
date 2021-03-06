import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  SimpleChanges
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { Sidebar } from './sidebar.component';
import { SidebarService } from './sidebar.service';

// Based on https://github.com/angular/material2/tree/master/src/lib/sidenav
@Component({
  selector: 'ng-sidebar-container',
  template: `
    <div *ngIf="showBackdrop"
      aria-hidden="true"
      class="ng-sidebar__backdrop"
      [ngClass]="backdropClass"
      (click)="_onBackdropClicked()"></div>

    <div class="ng-sidebar__content"
      [ngClass]="sidebarContentClass"
      [ngStyle]="_getContentStyles()">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    :host {
      box-sizing: border-box;
      display: block;
      overflow: hidden;
      position: relative;
    }

    .ng-sidebar__backdrop {
      background: #000;
      height: 100%;
      left: 0;
      opacity: 0.75;
      pointer-events: auto;
      position: fixed;
      top: 0;
      width: 100%;
      z-index: 99999998;
    }

    .ng-sidebar__content {
      display: block;
      height: 100%;
    }

      :host.ng-sidebar-container--animate .ng-sidebar__content {
        -webkit-transition: -webkit-transform 0.3s cubic-bezier(0, 0, 0.3, 1), padding 0.3s cubic-bezier(0, 0, 0.3, 1);
        transition: transform 0.3s cubic-bezier(0, 0, 0.3, 1), padding 0.3s cubic-bezier(0, 0, 0.3, 1);
      }
  `],
  host: {
    '[class.ng-sidebar-container--animate]': 'animate'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarContainer implements AfterContentInit, OnChanges, OnDestroy {
  @Input() animate: boolean = true;

  @Input() allowSidebarBackdropControl: boolean = true;
  @Input() showBackdrop: boolean = false;
  @Output() showBackdropChange = new EventEmitter<boolean>();

  @Input() sidebarContentClass: string;
  @Input() backdropClass: string;

  private _isBrowser: boolean;

  private _sidebars: Array<Sidebar> = [];

  constructor(
    private _ref: ChangeDetectorRef,
    private _sidebarService: SidebarService,
    @Inject(PLATFORM_ID) platformId: Object) {
    this._isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterContentInit(): void {
    if (!this._isBrowser) { return; }

    this._onToggle();

    this._sidebarService.onRegister((sidebar) => {
      this._sidebars.push(sidebar);
      this._subscribe(sidebar);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this._isBrowser) { return; }

    if (changes['showBackdrop']) {
      this.showBackdropChange.emit(changes['showBackdrop'].currentValue);
    }
  }

  ngOnDestroy(): void {
    if (!this._isBrowser) { return; }

    this._unsubscribe();
  }

  /**
   * @internal
   *
   * Computes `margin` value to push page contents to accommodate open sidebars as needed.
   *
   * @return {CSSStyleDeclaration} margin styles for the page content.
   */
  _getContentStyles(): CSSStyleDeclaration {
    let left = 0,
        right = 0,
        top = 0,
        bottom = 0;

    let transformStyle: string = null;
    let heightStyle: string = null;
    let widthStyle: string = null;

    if (this._sidebars) {
      this._sidebars.forEach((sidebar: Sidebar) => {
        if (!sidebar) { return; }

        const isLeftOrRight: boolean = sidebar.position === 'left' || sidebar.position === 'right';

        // Slide mode: we need to translate the entire container
        if (sidebar._isModeSlide) {
          if (sidebar.opened) {
            const isLeftOrTop: boolean = sidebar.position === 'left' || sidebar.position === 'top';

            const transformDir: string = isLeftOrRight ? 'X' : 'Y';
            const transformAmt: string = `${isLeftOrTop ? '' : '-'}${isLeftOrRight ? sidebar._width : sidebar._height}`;

            transformStyle = `translate${transformDir}(${transformAmt}px)`;
          }
        }

        // Create a space for the sidebar
        if ((sidebar._isModePush && sidebar.opened) || sidebar.dock) {
          let paddingAmt: number = 0;

          if (sidebar._isModeSlide && sidebar.opened) {
            const offsetDim = `calc(100% - ${sidebar._dockedSize}px`;
            if (isLeftOrRight) {
              widthStyle = offsetDim;
            } else {
              heightStyle = offsetDim;
            }
          } else {
            if (sidebar._isDocked || (sidebar._isModeOver && sidebar.dock)) {
              paddingAmt = sidebar._dockedSize;
            } else {
              paddingAmt = isLeftOrRight ? sidebar._width : sidebar._height;
            }
          }

          switch (sidebar.position) {
            case 'left':
              left = Math.max(left, paddingAmt);
              break;

            case 'right':
              right = Math.max(right, paddingAmt);
              break;

            case 'top':
              top = Math.max(top, paddingAmt);
              break;

            case 'bottom':
              bottom = Math.max(bottom, paddingAmt);
              break;
          }
        }
      });
    }

    return {
      padding: `${top}px ${right}px ${bottom}px ${left}px`,
      webkitTransform: transformStyle,
      transform: transformStyle,
      height: heightStyle,
      width: widthStyle
    } as CSSStyleDeclaration;
  }

  /**
   * @internal
   *
   * Closes sidebars when the backdrop is clicked, if they have the
   * `closeOnClickBackdrop` option set.
   */
  _onBackdropClicked(): void {
    this._sidebars.forEach((sidebar: Sidebar) => {
      if (sidebar.opened && sidebar.showBackdrop && sidebar.closeOnClickBackdrop) {
        sidebar.close();
      }
    });
  }

  /**
   * Subscribes from a sidebar events to react properly.
   */
  private _subscribe(sidebar: Sidebar): void {
    sidebar.onOpenStart.subscribe(() => this._onToggle());
    sidebar.onOpened.subscribe(() => this._markForCheck());

    sidebar.onCloseStart.subscribe(() => this._onToggle());
    sidebar.onClosed.subscribe(() => this._markForCheck());

    sidebar.onModeChange.subscribe(() => this._markForCheck());
    sidebar.onPositionChange.subscribe(() => this._markForCheck());

    sidebar._onRerender.subscribe(() => this._markForCheck());
  }

  /**
   * Unsubscribes from all sidebars.
   */
  private _unsubscribe(): void {
    if (this._sidebars) {
      this._sidebars.forEach((sidebar: Sidebar) => {
        if (!sidebar) { return; }

        sidebar.onOpenStart.unsubscribe();
        sidebar.onOpened.unsubscribe();

        sidebar.onCloseStart.unsubscribe();
        sidebar.onClosed.unsubscribe();

        sidebar.onModeChange.unsubscribe();
        sidebar.onPositionChange.unsubscribe();

        sidebar._onRerender.unsubscribe();
      });
    }
  }

  /**
   * Check if we should show the backdrop when a sidebar is toggled.
   */
  private _onToggle(): void {
    if (this._sidebars && this.allowSidebarBackdropControl) {
      // Show backdrop if a single open sidebar has it set
      const hasOpen = this._sidebars.some(sidebar => sidebar.opened && sidebar.showBackdrop);

      this.showBackdrop = hasOpen;
      this.showBackdropChange.emit(hasOpen);
    }

    setTimeout(() => {
      this._markForCheck();
    });
  }

  /**
   * Triggers change detection to recompute styles.
   */
  private _markForCheck(): void {
    this._ref.markForCheck();
  }
}
