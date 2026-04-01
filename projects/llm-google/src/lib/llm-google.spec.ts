import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LlmGoogle } from './llm-google';

describe('LlmGoogle', () => {
  let component: LlmGoogle;
  let fixture: ComponentFixture<LlmGoogle>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LlmGoogle],
    }).compileComponents();

    fixture = TestBed.createComponent(LlmGoogle);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
