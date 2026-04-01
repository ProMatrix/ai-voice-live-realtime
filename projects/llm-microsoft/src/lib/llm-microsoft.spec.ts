import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LlmMicrosoft } from './llm-microsoft';

describe('LlmMicrosoft', () => {
  let component: LlmMicrosoft;
  let fixture: ComponentFixture<LlmMicrosoft>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LlmMicrosoft],
    }).compileComponents();

    fixture = TestBed.createComponent(LlmMicrosoft);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
