import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LlmCommon } from './llm-common';

describe('LlmCommon', () => {
  let component: LlmCommon;
  let fixture: ComponentFixture<LlmCommon>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LlmCommon],
    }).compileComponents();

    fixture = TestBed.createComponent(LlmCommon);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
