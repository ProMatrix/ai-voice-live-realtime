import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SharedUx } from './shared-ux';

describe('SharedUx', () => {
  let component: SharedUx;
  let fixture: ComponentFixture<SharedUx>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedUx],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedUx);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
